package calculator

import (
	"context"
	"errors"
	"math"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestServiceCalculate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		request    Request
		wantResult Result
		wantCode   Code
		wantField  string
	}{
		{
			name:       "adds operands",
			request:    Request{Operation: "add", Operands: []float64{1, 2}},
			wantResult: Result{Value: 3},
		},
		{
			name:       "powers the base",
			request:    Request{Operation: "power", Operands: []float64{2, 8}},
			wantResult: Result{Value: 256},
		},
		{
			name:       "takes the square root",
			request:    Request{Operation: "sqrt", Operands: []float64{16}},
			wantResult: Result{Value: 4},
		},
		{
			name:      "rejects an unknown operation",
			request:   Request{Operation: "modulo", Operands: []float64{4, 2}},
			wantCode:  CodeUnknownOperation,
			wantField: "/operation",
		},
		{
			name:      "rejects too few operands",
			request:   Request{Operation: "add", Operands: []float64{1}},
			wantCode:  CodeInvalidArity,
			wantField: "/operands",
		},
		{
			name:      "rejects too many operands",
			request:   Request{Operation: "sqrt", Operands: []float64{1, 2}},
			wantCode:  CodeInvalidArity,
			wantField: "/operands",
		},
		{
			name:      "rejects zero operands",
			request:   Request{Operation: "negate", Operands: nil},
			wantCode:  CodeInvalidArity,
			wantField: "/operands",
		},
		{
			name:      "rejects a NaN operand",
			request:   Request{Operation: "add", Operands: []float64{math.NaN(), 1}},
			wantCode:  CodeInvalidNumber,
			wantField: "/operands/0",
		},
		{
			name:      "rejects an infinite operand",
			request:   Request{Operation: "add", Operands: []float64{1, math.Inf(1)}},
			wantCode:  CodeInvalidNumber,
			wantField: "/operands/1",
		},
		{
			name:     "propagates a domain error",
			request:  Request{Operation: "divide", Operands: []float64{1, 0}},
			wantCode: CodeDivisionByZero,
		},
	}

	service := NewService()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := service.Calculate(context.Background(), tc.request)
			if tc.wantCode != "" {
				var domainErr *Error
				if !errors.As(err, &domainErr) {
					t.Fatalf("Calculate(%+v) error = %v, want code %q", tc.request, err, tc.wantCode)
				}
				if domainErr.Code != tc.wantCode {
					t.Errorf("Calculate(%+v) code = %q, want %q", tc.request, domainErr.Code, tc.wantCode)
				}
				if domainErr.Field != tc.wantField {
					t.Errorf("Calculate(%+v) field = %q, want %q", tc.request, domainErr.Field, tc.wantField)
				}
				return
			}

			if err != nil {
				t.Fatalf("Calculate(%+v) error = %v, want nil", tc.request, err)
			}
			if diff := cmp.Diff(tc.wantResult, got); diff != "" {
				t.Errorf("Calculate(%+v) mismatch (-want +got):\n%s", tc.request, diff)
			}
		})
	}
}
