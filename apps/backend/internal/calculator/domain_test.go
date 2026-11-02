package calculator

import (
	"errors"
	"math"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestRegistryOperations(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		operation string
		operands  []float64
		want      float64
		wantCode  Code
	}{
		{name: "add", operation: "add", operands: []float64{1, 2}, want: 3},
		{name: "add floats", operation: "add", operands: []float64{0.1, 0.2}, want: 0.30000000000000004},
		{name: "subtract", operation: "subtract", operands: []float64{5, 8}, want: -3},
		{name: "multiply", operation: "multiply", operands: []float64{4, 2.5}, want: 10},
		{name: "divide", operation: "divide", operands: []float64{1, 4}, want: 0.25},
		{name: "divide by zero", operation: "divide", operands: []float64{1, 0}, wantCode: CodeDivisionByZero},
		{name: "divide zero by zero", operation: "divide", operands: []float64{0, 0}, wantCode: CodeDivisionByZero},
		{name: "power", operation: "power", operands: []float64{2, 10}, want: 1024},
		{name: "power negative exponent", operation: "power", operands: []float64{2, -1}, want: 0.5},
		{name: "power zero to zero", operation: "power", operands: []float64{0, 0}, wantCode: CodeIndeterminate},
		{name: "power negative fractional exponent", operation: "power", operands: []float64{-4, 0.5}, wantCode: CodeComplexResult},
		{name: "power negative cube root", operation: "power", operands: []float64{-8, 1.0 / 3.0}, wantCode: CodeComplexResult},
		{name: "power negative integer exponent", operation: "power", operands: []float64{-4, 2}, want: 16},
		{name: "power negative integer exponent odd", operation: "power", operands: []float64{-2, 3}, want: -8},
		{name: "power zero negative exponent", operation: "power", operands: []float64{0, -1}, wantCode: CodeOverflow},
		{name: "power overflow", operation: "power", operands: []float64{1e308, 2}, wantCode: CodeOverflow},
		{name: "power underflow", operation: "power", operands: []float64{1e-300, 2}, want: 0},
		{name: "sqrt", operation: "sqrt", operands: []float64{9}, want: 3},
		{name: "sqrt negative", operation: "sqrt", operands: []float64{-4}, wantCode: CodeSqrtOfNegative},
		{name: "negate", operation: "negate", operands: []float64{5}, want: -5},
		{name: "negate positive zero", operation: "negate", operands: []float64{0}, want: math.Copysign(0, -1)},
		{name: "percent", operation: "percent", operands: []float64{50}, want: 0.5},
		{name: "add overflow", operation: "add", operands: []float64{math.MaxFloat64, math.MaxFloat64}, wantCode: CodeOverflow},
		{name: "multiply underflow", operation: "multiply", operands: []float64{1e-300, 1e-300}, want: 0},
	}

	registry := newRegistry()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			operation, ok := registry.lookup(tc.operation)
			if !ok {
				t.Fatalf("lookup(%q) returned false", tc.operation)
			}

			got, err := operation.apply(tc.operands)
			if tc.wantCode != "" {
				var domainErr *Error
				if !errors.As(err, &domainErr) {
					t.Fatalf("apply(%v) error = %v, want code %q", tc.operands, err, tc.wantCode)
				}
				if domainErr.Code != tc.wantCode {
					t.Errorf("apply(%v) code = %q, want %q", tc.operands, domainErr.Code, tc.wantCode)
				}
				return
			}

			if err != nil {
				t.Fatalf("apply(%v) error = %v, want nil", tc.operands, err)
			}
			if diff := cmp.Diff(tc.want, got); diff != "" {
				t.Errorf("apply(%v) mismatch (-want +got):\n%s", tc.operands, diff)
			}
		})
	}
}

func TestRegistryLookup(t *testing.T) {
	t.Parallel()

	registry := newRegistry()

	tests := []struct {
		name      string
		operation string
		wantOK    bool
		wantArity int
	}{
		{name: "binary add", operation: "add", wantOK: true, wantArity: 2},
		{name: "binary subtract", operation: "subtract", wantOK: true, wantArity: 2},
		{name: "binary multiply", operation: "multiply", wantOK: true, wantArity: 2},
		{name: "binary divide", operation: "divide", wantOK: true, wantArity: 2},
		{name: "binary power", operation: "power", wantOK: true, wantArity: 2},
		{name: "unary sqrt", operation: "sqrt", wantOK: true, wantArity: 1},
		{name: "unary negate", operation: "negate", wantOK: true, wantArity: 1},
		{name: "unary percent", operation: "percent", wantOK: true, wantArity: 1},
		{name: "unknown", operation: "modulo", wantOK: false},
		{name: "empty", operation: "", wantOK: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			operation, ok := registry.lookup(tc.operation)
			if ok != tc.wantOK {
				t.Fatalf("lookup(%q) ok = %t, want %t", tc.operation, ok, tc.wantOK)
			}
			if !ok {
				return
			}
			if operation.name != tc.operation {
				t.Errorf("lookup(%q).name = %q, want %q", tc.operation, operation.name, tc.operation)
			}
			if operation.arity != tc.wantArity {
				t.Errorf("lookup(%q).arity = %d, want %d", tc.operation, operation.arity, tc.wantArity)
			}
		})
	}
}

func TestErrorString(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  *Error
		want string
	}{
		{
			name: "with detail",
			err:  &Error{Code: CodeDivisionByZero, Detail: "cannot divide by zero"},
			want: "cannot divide by zero",
		},
		{
			name: "without detail",
			err:  &Error{Code: CodeOverflow},
			want: "calculator error",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := tc.err.Error(); got != tc.want {
				t.Errorf("Error() = %q, want %q", got, tc.want)
			}
		})
	}
}
