// Package adapters provides the HTTP and in-memory adapters for the calculator.
package adapters

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"agner/dev/calc/internal/calculator"
)

const (
	maxBodyBytes   = 1 << 20
	calculatePath  = "/api/v1/calculate"
	healthPath     = "/healthz"
	problemBaseURI = "https://calc.example/problems/"
)

// Calculator is the consumer-owned port the HTTP adapter depends on.
type Calculator interface {
	Calculate(ctx context.Context, request calculator.Request) (calculator.Result, error)
}

type problemCode string

const (
	problemInvalidJSON        problemCode = "INVALID_JSON"
	problemMissingField       problemCode = "MISSING_FIELD"
	problemUnknownOperation   problemCode = "UNKNOWN_OPERATION"
	problemInvalidArity       problemCode = "INVALID_ARITY"
	problemInvalidOperandType problemCode = "INVALID_OPERAND_TYPE"
	problemUnsupportedMedia   problemCode = "UNSUPPORTED_MEDIA_TYPE"
	problemContentTooLarge    problemCode = "CONTENT_TOO_LARGE"
	problemDivisionByZero     problemCode = "DIVISION_BY_ZERO"
	problemSqrtOfNegative     problemCode = "SQRT_OF_NEGATIVE"
	problemComplexResult      problemCode = "COMPLEX_RESULT"
	problemIndeterminate      problemCode = "INDETERMINATE"
	problemOverflow           problemCode = "OVERFLOW"
	problemInvalidNumber      problemCode = "INVALID_NUMBER"
	problemNotFound           problemCode = "NOT_FOUND"
	problemMethodNotAllowed   problemCode = "METHOD_NOT_ALLOWED"
	problemInternalError      problemCode = "INTERNAL_ERROR"
)

type problemSpec struct {
	status int
	title  string
	slug   string
	detail string
}

var problemSpecs = map[problemCode]problemSpec{
	problemInvalidJSON:        {status: http.StatusBadRequest, title: "Invalid JSON", slug: "invalid-json", detail: "request body must be a single JSON object"},
	problemMissingField:       {status: http.StatusBadRequest, title: "Missing field", slug: "missing-field", detail: "a required field is missing"},
	problemUnknownOperation:   {status: http.StatusBadRequest, title: "Unknown operation", slug: "unknown-operation"},
	problemInvalidArity:       {status: http.StatusBadRequest, title: "Invalid arity", slug: "invalid-arity"},
	problemInvalidOperandType: {status: http.StatusBadRequest, title: "Invalid operand type", slug: "invalid-operand-type"},
	problemUnsupportedMedia:   {status: http.StatusUnsupportedMediaType, title: "Unsupported media type", slug: "unsupported-media-type", detail: "Content-Type must be application/json"},
	problemContentTooLarge:    {status: http.StatusRequestEntityTooLarge, title: "Content too large", slug: "content-too-large", detail: "request body must not exceed 1 MiB"},
	problemDivisionByZero:     {status: http.StatusUnprocessableEntity, title: "Division by zero", slug: "division-by-zero"},
	problemSqrtOfNegative:     {status: http.StatusUnprocessableEntity, title: "Square root of negative", slug: "sqrt-of-negative"},
	problemComplexResult:      {status: http.StatusUnprocessableEntity, title: "Complex result", slug: "complex-result"},
	problemIndeterminate:      {status: http.StatusUnprocessableEntity, title: "Indeterminate", slug: "indeterminate"},
	problemOverflow:           {status: http.StatusUnprocessableEntity, title: "Overflow", slug: "overflow"},
	problemInvalidNumber:      {status: http.StatusUnprocessableEntity, title: "Invalid number", slug: "invalid-number"},
	problemNotFound:           {status: http.StatusNotFound, title: "Not found", slug: "not-found", detail: "no route matches the request path"},
	problemMethodNotAllowed:   {status: http.StatusMethodNotAllowed, title: "Method not allowed", slug: "method-not-allowed", detail: "the method is not allowed on this path"},
	problemInternalError:      {status: http.StatusInternalServerError, title: "Internal error", slug: "internal-error", detail: "the server could not complete the request"},
}

func domainProblem(code calculator.Code) problemCode {
	switch code {
	case calculator.CodeUnknownOperation:
		return problemUnknownOperation
	case calculator.CodeInvalidArity:
		return problemInvalidArity
	case calculator.CodeInvalidNumber:
		return problemInvalidNumber
	case calculator.CodeDivisionByZero:
		return problemDivisionByZero
	case calculator.CodeSqrtOfNegative:
		return problemSqrtOfNegative
	case calculator.CodeComplexResult:
		return problemComplexResult
	case calculator.CodeIndeterminate:
		return problemIndeterminate
	case calculator.CodeOverflow:
		return problemOverflow
	default:
		return problemInternalError
	}
}

type problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Instance string `json:"instance"`
	Code     string `json:"code"`
	Field    string `json:"field,omitempty"`
}

type rawRequest struct {
	Operation json.RawMessage `json:"operation"`
	Operands  json.RawMessage `json:"operands"`
}

type requestProblem struct {
	code   problemCode
	field  string
	detail string
}

// HTTP is the HTTP adapter for the calculator use cases.
type HTTP struct {
	calculator Calculator
}

// NewHTTP returns an HTTP adapter backed by the given calculator.
func NewHTTP(calc Calculator) *HTTP {
	return &HTTP{calculator: calc}
}

// Handler returns the HTTP handler for the adapter routes.
func (h *HTTP) Handler() http.Handler {
	return http.HandlerFunc(h.route)
}

func (h *HTTP) route(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case calculatePath:
		h.handleCalculate(w, r)
	case healthPath:
		h.handleHealth(w, r)
	default:
		h.handleNotFound(w)
	}
}

func (h *HTTP) handleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		h.writeProblem(w, problemMethodNotAllowed, "", "only POST is allowed on the calculate path")
		return
	}

	if !isJSONContentType(r.Header.Get("Content-Type")) {
		h.writeProblem(w, problemUnsupportedMedia, "", "")
		return
	}

	request, requestErr := decodeRequest(w, r)
	if requestErr != nil {
		h.writeProblem(w, requestErr.code, requestErr.field, requestErr.detail)
		return
	}

	result, err := h.calculator.Calculate(r.Context(), request)
	if err != nil {
		var domainErr *calculator.Error
		if errors.As(err, &domainErr) {
			h.writeProblem(w, domainProblem(domainErr.Code), domainErr.Field, domainErr.Detail)
			return
		}
		h.writeProblem(w, problemInternalError, "", "")
		return
	}

	if !isFinite(result.Value) {
		h.writeProblem(w, problemInternalError, "", "")
		return
	}

	writeResult(w, result.Value)
}

func (h *HTTP) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		h.writeProblem(w, problemMethodNotAllowed, "", "only GET is allowed on the health path")
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok\n")
}

func (h *HTTP) handleNotFound(w http.ResponseWriter) {
	h.writeProblem(w, problemNotFound, "", "")
}

func (h *HTTP) writeProblem(w http.ResponseWriter, code problemCode, field, detail string) {
	spec, ok := problemSpecs[code]
	if !ok {
		code = problemInternalError
		spec = problemSpecs[code]
	}
	if detail == "" {
		detail = spec.detail
	}

	body := problem{
		Type:     problemBaseURI + spec.slug,
		Title:    spec.title,
		Status:   spec.status,
		Detail:   detail,
		Instance: newInstanceID(),
		Code:     string(code),
		Field:    field,
	}

	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(spec.status)
	_ = json.NewEncoder(w).Encode(body)
}

func decodeRequest(w http.ResponseWriter, r *http.Request) (calculator.Request, *requestProblem) {
	body := http.MaxBytesReader(w, r.Body, maxBodyBytes)
	defer func() { _ = body.Close() }()

	data, err := io.ReadAll(body)
	if err != nil {
		if isTooLarge(err) {
			return calculator.Request{}, &requestProblem{code: problemContentTooLarge}
		}
		return calculator.Request{}, &requestProblem{code: problemInvalidJSON}
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	var payload rawRequest
	if err := decoder.Decode(&payload); err != nil {
		return calculator.Request{}, &requestProblem{code: problemInvalidJSON}
	}

	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return calculator.Request{}, &requestProblem{
			code:   problemInvalidJSON,
			detail: "request body must contain a single JSON value",
		}
	}

	operation, requestErr := decodeOperation(payload.Operation)
	if requestErr != nil {
		return calculator.Request{}, requestErr
	}

	operands, requestErr := decodeOperands(payload.Operands)
	if requestErr != nil {
		return calculator.Request{}, requestErr
	}

	return calculator.Request{Operation: operation, Operands: operands}, nil
}

func decodeOperation(raw json.RawMessage) (string, *requestProblem) {
	if len(raw) == 0 {
		return "", &requestProblem{code: problemMissingField, field: "/operation", detail: "operation is required"}
	}

	var operation *string
	if err := json.Unmarshal(raw, &operation); err != nil || operation == nil {
		return "", &requestProblem{code: problemInvalidJSON, field: "/operation", detail: "operation must be a string"}
	}

	return *operation, nil
}

func decodeOperands(raw json.RawMessage) ([]float64, *requestProblem) {
	if len(raw) == 0 {
		return nil, &requestProblem{code: problemMissingField, field: "/operands", detail: "operands are required"}
	}

	var rawOperands []json.RawMessage
	if err := json.Unmarshal(raw, &rawOperands); err != nil || rawOperands == nil {
		return nil, &requestProblem{code: problemInvalidJSON, field: "/operands", detail: "operands must be an array"}
	}

	operands := make([]float64, len(rawOperands))
	for index, rawOperand := range rawOperands {
		field := fmt.Sprintf("/operands/%d", index)

		trimmed := bytes.TrimSpace(rawOperand)
		if len(trimmed) == 0 || (trimmed[0] != '-' && (trimmed[0] < '0' || trimmed[0] > '9')) {
			return nil, &requestProblem{code: problemInvalidOperandType, field: field, detail: "operand must be a number"}
		}

		var number json.Number
		if err := json.Unmarshal(trimmed, &number); err != nil {
			return nil, &requestProblem{code: problemInvalidOperandType, field: field, detail: "operand must be a number"}
		}

		value, err := strconv.ParseFloat(number.String(), 64)
		if err != nil && !errors.Is(err, strconv.ErrRange) {
			return nil, &requestProblem{code: problemInvalidOperandType, field: field, detail: "operand must be a number"}
		}
		operands[index] = value
	}

	return operands, nil
}

func isJSONContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return strings.EqualFold(mediaType, "application/json")
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func isTooLarge(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

func writeResult(w http.ResponseWriter, value float64) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, `{"result":`+strconv.FormatFloat(value, 'g', -1, 64)+`}`)
}

func newInstanceID() string {
	var raw [16]byte
	// rand.Read never returns an error and always fills the buffer.
	_, _ = rand.Read(raw[:])
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80

	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
