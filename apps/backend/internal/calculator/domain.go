// Package calculator provides the calculator domain model and use cases.
package calculator

import "math"

// Code identifies a typed calculator error.
type Code string

const (
	// CodeUnknownOperation reports an operation that is not in the registry.
	CodeUnknownOperation Code = "UNKNOWN_OPERATION"
	// CodeInvalidArity reports a wrong operand count for the operation.
	CodeInvalidArity Code = "INVALID_ARITY"
	// CodeInvalidNumber reports a non-finite operand.
	CodeInvalidNumber Code = "INVALID_NUMBER"
	// CodeDivisionByZero reports a division whose divisor is zero.
	CodeDivisionByZero Code = "DIVISION_BY_ZERO"
	// CodeSqrtOfNegative reports a square root of a negative number.
	CodeSqrtOfNegative Code = "SQRT_OF_NEGATIVE"
	// CodeComplexResult reports a negative base raised to a fractional exponent.
	CodeComplexResult Code = "COMPLEX_RESULT"
	// CodeIndeterminate reports zero raised to the power of zero.
	CodeIndeterminate Code = "INDETERMINATE"
	// CodeOverflow reports a non-finite result.
	CodeOverflow Code = "OVERFLOW"
)

// Error is a typed calculator error carrying a stable code, an optional JSON
// Pointer field, and a human-readable detail.
type Error struct {
	Code   Code
	Field  string
	Detail string
}

// Error returns the detail, keeping error strings lowercase and
// punctuation-free; the typed Code carries the machine-readable identity.
func (e *Error) Error() string {
	if e.Detail != "" {
		return e.Detail
	}
	return "calculator error"
}

// Request is a single calculation request.
type Request struct {
	Operation string
	Operands  []float64
}

// Result is the value produced by a successful calculation.
type Result struct {
	Value float64
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
