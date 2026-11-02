package adapters

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"agner/dev/calc/internal/calculator"
)

func FuzzCalculateHandler(f *testing.F) {
	f.Add([]byte(`{"operation":"add","operands":[1,2]}`))
	f.Add([]byte(`{"operation":"sqrt","operands":[9]}`))
	f.Add([]byte(`{"operation":"divide","operands":[1,0]}`))
	f.Add([]byte(`{"operation":"sqrt","operands":[-4]}`))
	f.Add([]byte(`{"operation":"add","operands":[1,2]} junk`))
	f.Add([]byte(`{"operation":"add","operands":[NaN,1]}`))
	f.Add([]byte(`{"operation":"add"}`))
	f.Add([]byte(`{"operation":"add","operands":["2"]}`))
	f.Add([]byte(`{`))
	f.Add([]byte(``))

	handler := NewHTTP(calculator.NewService()).Handler()
	allowed := map[int]bool{
		http.StatusOK:                    true,
		http.StatusBadRequest:            true,
		http.StatusNotFound:              true,
		http.StatusMethodNotAllowed:      true,
		http.StatusRequestEntityTooLarge: true,
		http.StatusUnsupportedMediaType:  true,
		http.StatusUnprocessableEntity:   true,
		http.StatusInternalServerError:   true,
	}

	f.Fuzz(func(t *testing.T, body []byte) {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", bytes.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, request)

		if !allowed[recorder.Code] {
			t.Fatalf("status = %d, want an allowed status; body = %q", recorder.Code, recorder.Body.String())
		}
		if recorder.Code == http.StatusOK {
			var response calculateResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode success body %q: %v", recorder.Body.String(), err)
			}
			if math.IsNaN(response.Result) || math.IsInf(response.Result, 0) {
				t.Fatalf("success result = %v, want a finite number", response.Result)
			}
		}
	})
}
