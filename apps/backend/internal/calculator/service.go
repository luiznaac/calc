package calculator

import (
	"context"
	"fmt"
	"math"
)

// Service runs calculator use cases against the operation registry.
type Service struct {
	registry registry
}

// NewService returns a Service with all supported operations registered.
func NewService() *Service {
	return &Service{registry: newRegistry()}
}

// Calculate validates the request and applies its single operation.
func (s *Service) Calculate(_ context.Context, request Request) (Result, error) {
	operation, ok := s.registry.lookup(request.Operation)
	if !ok {
		return Result{}, &Error{
			Code:   CodeUnknownOperation,
			Field:  "/operation",
			Detail: fmt.Sprintf("unknown operation %q", request.Operation),
		}
	}

	value, err := operation.apply(request.Operands)
	if err != nil {
		return Result{}, err
	}
	return Result{Value: value}, nil
}

type operation struct {
	name    string
	arity   int
	applyFn func(operands []float64) (float64, error)
}

func (o operation) apply(operands []float64) (float64, error) {
	if len(operands) != o.arity {
		return 0, &Error{
			Code:   CodeInvalidArity,
			Field:  "/operands",
			Detail: fmt.Sprintf("%s takes %d operand(s)", o.name, o.arity),
		}
	}

	for index, operand := range operands {
		if !isFinite(operand) {
			return 0, &Error{
				Code:   CodeInvalidNumber,
				Field:  fmt.Sprintf("/operands/%d", index),
				Detail: "operand must be a finite number",
			}
		}
	}

	result, err := o.applyFn(operands)
	if err != nil {
		return 0, err
	}
	if !isFinite(result) {
		return 0, &Error{Code: CodeOverflow, Detail: "result is not finite"}
	}
	return result, nil
}

type registry struct {
	operations map[string]operation
}

func newRegistry() registry {
	operations := make(map[string]operation, 8)

	register := func(name string, arity int, applyFn func([]float64) (float64, error)) {
		operations[name] = operation{name: name, arity: arity, applyFn: applyFn}
	}

	register("add", 2, func(operands []float64) (float64, error) {
		return operands[0] + operands[1], nil
	})
	register("subtract", 2, func(operands []float64) (float64, error) {
		return operands[0] - operands[1], nil
	})
	register("multiply", 2, func(operands []float64) (float64, error) {
		return operands[0] * operands[1], nil
	})
	register("divide", 2, func(operands []float64) (float64, error) {
		if operands[1] == 0 {
			return 0, &Error{Code: CodeDivisionByZero, Detail: "cannot divide by zero"}
		}
		return operands[0] / operands[1], nil
	})
	register("power", 2, func(operands []float64) (float64, error) {
		base, exponent := operands[0], operands[1]
		if base == 0 && exponent == 0 {
			return 0, &Error{Code: CodeIndeterminate, Detail: "zero to the power of zero is indeterminate"}
		}
		if base < 0 && math.Trunc(exponent) != exponent {
			return 0, &Error{
				Code:   CodeComplexResult,
				Detail: "negative base with a fractional exponent has a complex result",
			}
		}
		return math.Pow(base, exponent), nil
	})
	register("sqrt", 1, func(operands []float64) (float64, error) {
		if operands[0] < 0 {
			return 0, &Error{
				Code:   CodeSqrtOfNegative,
				Detail: "square root of a negative number is not real",
			}
		}
		return math.Sqrt(operands[0]), nil
	})
	register("negate", 1, func(operands []float64) (float64, error) {
		return -operands[0], nil
	})
	register("percent", 1, func(operands []float64) (float64, error) {
		return operands[0] / 100, nil
	})

	return registry{operations: operations}
}

func (r registry) lookup(name string) (operation, bool) {
	op, ok := r.operations[name]
	return op, ok
}
