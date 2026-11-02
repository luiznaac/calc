package adapters

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"

	"agner/dev/calc/internal/calculator"
)

type calculateResponse struct {
	Result float64 `json:"result"`
}

type problemResponse struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance"`
	Code     string `json:"code"`
	Field    string `json:"field"`
}

var uuidV4Pattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func newHandler() http.Handler {
	return NewHTTP(calculator.NewService()).Handler()
}

func serve(handler http.Handler, method, target, contentType, body string) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, target, reader)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeProblem(t *testing.T, recorder *httptest.ResponseRecorder) problemResponse {
	t.Helper()

	if got, want := recorder.Header().Get("Content-Type"), "application/problem+json"; got != want {
		t.Fatalf("Content-Type = %q, want %q", got, want)
	}

	var problem problemResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatalf("decode problem body %q: %v", recorder.Body.String(), err)
	}
	if problem.Status != recorder.Code {
		t.Errorf("problem status = %d, want HTTP status %d", problem.Status, recorder.Code)
	}
	if problem.Title == "" {
		t.Error("problem title is empty")
	}
	if !strings.HasPrefix(problem.Type, "https://calc.example/problems/") {
		t.Errorf("problem type = %q, want the stable problem base URI", problem.Type)
	}
	if !uuidV4Pattern.MatchString(problem.Instance) {
		t.Errorf("problem instance = %q, want a v4 UUID", problem.Instance)
	}
	return problem
}

func TestCalculateSuccess(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want float64
	}{
		{name: "add", body: `{"operation":"add","operands":[1,2]}`, want: 3},
		{name: "subtract", body: `{"operation":"subtract","operands":[5,8]}`, want: -3},
		{name: "multiply", body: `{"operation":"multiply","operands":[4,2.5]}`, want: 10},
		{name: "divide", body: `{"operation":"divide","operands":[1,4]}`, want: 0.25},
		{name: "power", body: `{"operation":"power","operands":[2,10]}`, want: 1024},
		{name: "sqrt", body: `{"operation":"sqrt","operands":[9]}`, want: 3},
		{name: "negate", body: `{"operation":"negate","operands":[5]}`, want: -5},
		{name: "percent", body: `{"operation":"percent","operands":[50]}`, want: 0.5},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body = %q", recorder.Code, recorder.Body.String())
			}
			if got, want := recorder.Header().Get("Content-Type"), "application/json"; got != want {
				t.Errorf("Content-Type = %q, want %q", got, want)
			}

			var response calculateResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode response %q: %v", recorder.Body.String(), err)
			}
			if diff := cmp.Diff(tc.want, response.Result); diff != "" {
				t.Errorf("result mismatch (-want +got):\n%s", diff)
			}
		})
	}
}

func TestCalculateResultUsesShortestRoundTrip(t *testing.T) {
	t.Parallel()

	recorder := serve(newHandler(), http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add","operands":[1,2]}`)
	if got, want := recorder.Body.String(), `{"result":3}`; got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestCalculateInvalidJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		body  string
		field string
	}{
		{name: "empty body", body: ""},
		{name: "truncated object", body: "{"},
		{name: "trailing data", body: `{"operation":"add","operands":[1,2]} junk`},
		{name: "second JSON value", body: `{"operation":"add","operands":[1,2]} {}`},
		{name: "NaN literal", body: `{"operation":"add","operands":[NaN,1]}`},
		{name: "Infinity literal", body: `{"operation":"add","operands":[Infinity,1]}`},
		{name: "top-level array", body: `[]`},
		{name: "operation is not a string", body: `{"operation":123,"operands":[1,2]}`, field: "/operation"},
		{name: "operands is an object", body: `{"operation":"add","operands":{}}`, field: "/operands"},
		{name: "operands is a number", body: `{"operation":"add","operands":5}`, field: "/operands"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "INVALID_JSON"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
			if problem.Field != tc.field {
				t.Errorf("field = %q, want %q", problem.Field, tc.field)
			}
		})
	}
}

func TestCalculateMissingField(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		body  string
		field string
	}{
		{name: "empty object", body: `{}`, field: "/operation"},
		{name: "missing operation", body: `{"operands":[1,2]}`, field: "/operation"},
		{name: "null body", body: `null`, field: "/operation"},
		{name: "missing operands", body: `{"operation":"add"}`, field: "/operands"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "MISSING_FIELD"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
			if problem.Field != tc.field {
				t.Errorf("field = %q, want %q", problem.Field, tc.field)
			}
		})
	}
}

func TestCalculateNullMembersAreInvalidJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		body  string
		field string
	}{
		{name: "null operation", body: `{"operation":null,"operands":[1,2]}`, field: "/operation"},
		{name: "null operands", body: `{"operation":"add","operands":null}`, field: "/operands"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "INVALID_JSON"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
			if problem.Field != tc.field {
				t.Errorf("field = %q, want %q", problem.Field, tc.field)
			}
		})
	}
}

func TestCalculateInvalidOperandType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		body  string
		field string
	}{
		{name: "string operand", body: `{"operation":"add","operands":[1,"2"]}`, field: "/operands/1"},
		{name: "null operand", body: `{"operation":"add","operands":[1,null]}`, field: "/operands/1"},
		{name: "boolean operand", body: `{"operation":"add","operands":[true,2]}`, field: "/operands/0"},
		{name: "object operand", body: `{"operation":"add","operands":[1,{"value":2}]}`, field: "/operands/1"},
		{name: "array operand", body: `{"operation":"add","operands":[1,[2]]}`, field: "/operands/1"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "INVALID_OPERAND_TYPE"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
			if problem.Field != tc.field {
				t.Errorf("field = %q, want %q", problem.Field, tc.field)
			}
		})
	}
}

func TestCalculateRequestShapeErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		body  string
		code  string
		field string
	}{
		{name: "unknown operation", body: `{"operation":"modulo","operands":[4,2]}`, code: "UNKNOWN_OPERATION", field: "/operation"},
		{name: "too few operands", body: `{"operation":"add","operands":[1]}`, code: "INVALID_ARITY", field: "/operands"},
		{name: "too many operands", body: `{"operation":"sqrt","operands":[1,2]}`, code: "INVALID_ARITY", field: "/operands"},
		{name: "zero operands", body: `{"operation":"negate","operands":[]}`, code: "INVALID_ARITY", field: "/operands"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if problem.Code != tc.code {
				t.Errorf("code = %q, want %q", problem.Code, tc.code)
			}
			if problem.Field != tc.field {
				t.Errorf("field = %q, want %q", problem.Field, tc.field)
			}
		})
	}
}

func TestCalculateDomainErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		code string
	}{
		{name: "division by zero", body: `{"operation":"divide","operands":[1,0]}`, code: "DIVISION_BY_ZERO"},
		{name: "sqrt of negative", body: `{"operation":"sqrt","operands":[-4]}`, code: "SQRT_OF_NEGATIVE"},
		{name: "complex result", body: `{"operation":"power","operands":[-4,0.5]}`, code: "COMPLEX_RESULT"},
		{name: "indeterminate", body: `{"operation":"power","operands":[0,0]}`, code: "INDETERMINATE"},
		{name: "overflow", body: `{"operation":"multiply","operands":[1e308,1e308]}`, code: "OVERFLOW"},
		{name: "non-finite operand", body: `{"operation":"add","operands":[1e400,1]}`, code: "INVALID_NUMBER"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422; body = %q", recorder.Code, recorder.Body.String())
			}
			problem := decodeProblem(t, recorder)
			if problem.Code != tc.code {
				t.Errorf("code = %q, want %q", problem.Code, tc.code)
			}
		})
	}
}

func TestDomainProblemMapping(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		code       calculator.Code
		want       problemCode
		wantStatus int
	}{
		{name: "unknown operation", code: calculator.CodeUnknownOperation, want: problemUnknownOperation, wantStatus: http.StatusBadRequest},
		{name: "invalid arity", code: calculator.CodeInvalidArity, want: problemInvalidArity, wantStatus: http.StatusBadRequest},
		{name: "invalid number", code: calculator.CodeInvalidNumber, want: problemInvalidNumber, wantStatus: http.StatusUnprocessableEntity},
		{name: "division by zero", code: calculator.CodeDivisionByZero, want: problemDivisionByZero, wantStatus: http.StatusUnprocessableEntity},
		{name: "sqrt of negative", code: calculator.CodeSqrtOfNegative, want: problemSqrtOfNegative, wantStatus: http.StatusUnprocessableEntity},
		{name: "complex result", code: calculator.CodeComplexResult, want: problemComplexResult, wantStatus: http.StatusUnprocessableEntity},
		{name: "indeterminate", code: calculator.CodeIndeterminate, want: problemIndeterminate, wantStatus: http.StatusUnprocessableEntity},
		{name: "overflow", code: calculator.CodeOverflow, want: problemOverflow, wantStatus: http.StatusUnprocessableEntity},
		{name: "unmapped code", code: calculator.Code("UNMAPPED"), want: problemInternalError, wantStatus: http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := domainProblem(tc.code)
			if got != tc.want {
				t.Fatalf("domainProblem(%q) = %q, want %q", tc.code, got, tc.want)
			}
			if status := problemSpecs[got].status; status != tc.wantStatus {
				t.Errorf("problem status = %d, want %d", status, tc.wantStatus)
			}
		})
	}
}

func TestServiceSatisfiesPort(t *testing.T) {
	t.Parallel()

	var _ Calculator = calculator.NewService()
}

func TestCalculateMediaType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		contentType string
		wantStatus  int
	}{
		{name: "missing", contentType: "", wantStatus: http.StatusUnsupportedMediaType},
		{name: "text plain", contentType: "text/plain", wantStatus: http.StatusUnsupportedMediaType},
		{name: "problem json", contentType: "application/problem+json", wantStatus: http.StatusUnsupportedMediaType},
		{name: "malformed parameter", contentType: "application/json; charset", wantStatus: http.StatusUnsupportedMediaType},
		{name: "application json", contentType: "application/json", wantStatus: http.StatusOK},
		{name: "charset tolerated", contentType: "application/json; charset=utf-8", wantStatus: http.StatusOK},
		{name: "upper-case charset", contentType: "application/json;charset=UTF-8", wantStatus: http.StatusOK},
		{name: "case-insensitive type", contentType: "Application/JSON", wantStatus: http.StatusOK},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", tc.contentType, `{"operation":"add","operands":[1,2]}`)
			if recorder.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body = %q", recorder.Code, tc.wantStatus, recorder.Body.String())
			}
			if tc.wantStatus == http.StatusUnsupportedMediaType {
				problem := decodeProblem(t, recorder)
				if got, want := problem.Code, "UNSUPPORTED_MEDIA_TYPE"; got != want {
					t.Errorf("code = %q, want %q", got, want)
				}
			}
		})
	}
}

func TestCalculateBodyCap(t *testing.T) {
	t.Parallel()

	const prefix = `{"operation":"add","operands":[1,2],"pad":"`
	const suffix = `"}`
	padding := maxBodyBytes - len(prefix) - len(suffix)
	if padding < 0 {
		t.Fatalf("body prefix is larger than the body cap")
	}

	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{
			name:       "exactly at cap",
			body:       prefix + strings.Repeat("a", padding) + suffix,
			wantStatus: http.StatusOK,
		},
		{
			name:       "one byte over cap",
			body:       prefix + strings.Repeat("a", padding+1) + suffix,
			wantStatus: http.StatusRequestEntityTooLarge,
		},
		{
			name:       "invalid body over cap",
			body:       strings.Repeat("x", maxBodyBytes+1),
			wantStatus: http.StatusRequestEntityTooLarge,
		},
		{
			name:       "unterminated body over cap",
			body:       prefix + strings.Repeat("a", maxBodyBytes),
			wantStatus: http.StatusRequestEntityTooLarge,
		},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if recorder.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, tc.wantStatus)
			}
			if tc.wantStatus == http.StatusRequestEntityTooLarge {
				problem := decodeProblem(t, recorder)
				if got, want := problem.Code, "CONTENT_TOO_LARGE"; got != want {
					t.Errorf("code = %q, want %q", got, want)
				}
			}
		})
	}
}

func TestCalculateLenientUnknownFields(t *testing.T) {
	t.Parallel()

	recorder := serve(newHandler(), http.MethodPost, "/api/v1/calculate", "application/json",
		`{"operation":"add","operands":[1,2],"extra":true,"nested":{"a":1}}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %q", recorder.Code, recorder.Body.String())
	}
}

func TestCalculateInstanceIsPerRequest(t *testing.T) {
	t.Parallel()

	handler := newHandler()
	first := decodeProblem(t, serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add"}`))
	second := decodeProblem(t, serve(handler, http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add"}`))
	if first.Instance == second.Instance {
		t.Errorf("instance = %q for both requests, want unique values", first.Instance)
	}
}

func TestHealthz(t *testing.T) {
	t.Parallel()

	recorder := serve(newHandler(), http.MethodGet, "/healthz", "", "")
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if got, want := recorder.Header().Get("Content-Type"), "text/plain; charset=utf-8"; got != want {
		t.Errorf("Content-Type = %q, want %q", got, want)
	}
	if got, want := recorder.Body.String(), "ok\n"; got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestHealthzMethodNotAllowed(t *testing.T) {
	t.Parallel()

	recorder := serve(newHandler(), http.MethodPost, "/healthz", "", "")
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", recorder.Code)
	}
	if got, want := recorder.Header().Get("Allow"), http.MethodGet; got != want {
		t.Errorf("Allow = %q, want %q", got, want)
	}
	problem := decodeProblem(t, recorder)
	if got, want := problem.Code, "METHOD_NOT_ALLOWED"; got != want {
		t.Errorf("code = %q, want %q", got, want)
	}
}

func TestCalculateMethodNotAllowed(t *testing.T) {
	t.Parallel()

	methods := []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch, http.MethodOptions, http.MethodHead}
	handler := newHandler()

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, method, "/api/v1/calculate", "", "")
			if recorder.Code != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want 405", recorder.Code)
			}
			if got, want := recorder.Header().Get("Allow"), http.MethodPost; got != want {
				t.Errorf("Allow = %q, want %q", got, want)
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "METHOD_NOT_ALLOWED"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
		})
	}
}

func TestUnknownPathIsNotFound(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		target string
	}{
		{name: "unknown GET", method: http.MethodGet, target: "/nope"},
		{name: "unknown POST", method: http.MethodPost, target: "/api/v1"},
		{name: "unclean path", method: http.MethodGet, target: "/foo//bar"},
		{name: "health trailing slash", method: http.MethodGet, target: "/healthz/"},
		{name: "calculate trailing slash", method: http.MethodPost, target: "/api/v1/calculate/"},
	}

	handler := newHandler()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, tc.method, tc.target, "application/json", `{"operation":"add","operands":[1,2]}`)
			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", recorder.Code)
			}
			if location := recorder.Header().Get("Location"); location != "" {
				t.Errorf("Location = %q, want no redirect", location)
			}
			problem := decodeProblem(t, recorder)
			if got, want := problem.Code, "NOT_FOUND"; got != want {
				t.Errorf("code = %q, want %q", got, want)
			}
		})
	}
}

func TestNoCORSHeaders(t *testing.T) {
	t.Parallel()

	requests := []struct {
		method string
		target string
		body   string
	}{
		{method: http.MethodOptions, target: "/api/v1/calculate"},
		{method: http.MethodPost, target: "/api/v1/calculate", body: `{"operation":"add","operands":[1,2]}`},
		{method: http.MethodPost, target: "/api/v1/calculate", body: `{"operation":"divide","operands":[1,0]}`},
		{method: http.MethodGet, target: "/healthz"},
		{method: http.MethodGet, target: "/nope"},
	}

	handler := newHandler()

	for _, request := range requests {
		t.Run(request.method+" "+request.target, func(t *testing.T) {
			t.Parallel()

			recorder := serve(handler, request.method, request.target, "application/json", request.body)
			for name := range recorder.Header() {
				if strings.HasPrefix(strings.ToLower(name), "access-control-") {
					t.Errorf("response carries CORS header %q", name)
				}
			}
		})
	}
}

func TestMemoryTestDouble(t *testing.T) {
	t.Parallel()

	t.Run("returns the configured result", func(t *testing.T) {
		t.Parallel()

		memory := &Memory{Result: calculator.Result{Value: 7}}
		recorder := serve(NewHTTP(memory).Handler(), http.MethodPost, "/api/v1/calculate", "application/json",
			`{"operation":"add","operands":[1,2]}`)
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body = %q", recorder.Code, recorder.Body.String())
		}
		want := []calculator.Request{{Operation: "add", Operands: []float64{1, 2}}}
		if diff := cmp.Diff(want, memory.Requests); diff != "" {
			t.Errorf("recorded requests mismatch (-want +got):\n%s", diff)
		}
	})

	t.Run("maps a typed fault", func(t *testing.T) {
		t.Parallel()

		memory := &Memory{Err: &calculator.Error{
			Code:   calculator.CodeInvalidNumber,
			Field:  "/operands/0",
			Detail: "operand must be a finite number",
		}}
		recorder := serve(NewHTTP(memory).Handler(), http.MethodPost, "/api/v1/calculate", "application/json",
			`{"operation":"add","operands":[1,2]}`)
		if recorder.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want 422; body = %q", recorder.Code, recorder.Body.String())
		}
		problem := decodeProblem(t, recorder)
		if got, want := problem.Code, "INVALID_NUMBER"; got != want {
			t.Errorf("code = %q, want %q", got, want)
		}
		if got, want := problem.Field, "/operands/0"; got != want {
			t.Errorf("field = %q, want %q", got, want)
		}
	})

	t.Run("maps a non-finite result", func(t *testing.T) {
		t.Parallel()

		memory := &Memory{Result: calculator.Result{Value: math.Inf(1)}}
		recorder := serve(NewHTTP(memory).Handler(), http.MethodPost, "/api/v1/calculate", "application/json",
			`{"operation":"add","operands":[1,2]}`)
		if recorder.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want 500; body = %q", recorder.Code, recorder.Body.String())
		}
		problem := decodeProblem(t, recorder)
		if got, want := problem.Code, "INTERNAL_ERROR"; got != want {
			t.Errorf("code = %q, want %q", got, want)
		}
	})

	t.Run("maps an untyped fault", func(t *testing.T) {
		t.Parallel()

		memory := &Memory{Err: errors.New("boom")}
		recorder := serve(NewHTTP(memory).Handler(), http.MethodPost, "/api/v1/calculate", "application/json",
			`{"operation":"add","operands":[1,2]}`)
		if recorder.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want 500; body = %q", recorder.Code, recorder.Body.String())
		}
		problem := decodeProblem(t, recorder)
		if got, want := problem.Code, "INTERNAL_ERROR"; got != want {
			t.Errorf("code = %q, want %q", got, want)
		}
	})
}
