package calculator

import (
	"context"
	"math"
	"testing"

	"pgregory.net/rapid"
)

type fatalf interface {
	Fatalf(format string, args ...any)
}

func calculate(t fatalf, service *Service, operation string, operands ...float64) float64 {
	result, err := service.Calculate(context.Background(), Request{Operation: operation, Operands: operands})
	if err != nil {
		t.Fatalf("Calculate(%q, %v) error = %v", operation, operands, err)
	}
	return result.Value
}

func closeEnough(got, want, tolerance float64) bool {
	if got == want {
		return true
	}
	scale := math.Max(math.Abs(got), math.Abs(want))
	return math.Abs(got-want) <= tolerance*scale
}

func TestAddIsCommutative(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		left := rapid.Float64Range(-1e100, 1e100).Draw(rt, "left")
		right := rapid.Float64Range(-1e100, 1e100).Draw(rt, "right")

		forward := calculate(rt, service, "add", left, right)
		backward := calculate(rt, service, "add", right, left)
		if forward != backward {
			rt.Fatalf("add(%v, %v) = %v, add(%v, %v) = %v", left, right, forward, right, left, backward)
		}
	})
}

func TestAddInverseHolds(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		value := rapid.Float64Range(-1e100, 1e100).Draw(rt, "value")

		negated := calculate(rt, service, "negate", value)
		if sum := calculate(rt, service, "add", value, negated); sum != 0 {
			rt.Fatalf("add(%v, negate(%v)) = %v, want 0", value, value, sum)
		}
	})
}

func TestMultiplyIsCommutative(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		left := rapid.Float64Range(-1e100, 1e100).Draw(rt, "left")
		right := rapid.Float64Range(-1e100, 1e100).Draw(rt, "right")

		forward := calculate(rt, service, "multiply", left, right)
		backward := calculate(rt, service, "multiply", right, left)
		if forward != backward {
			rt.Fatalf("multiply(%v, %v) = %v, multiply(%v, %v) = %v", left, right, forward, right, left, backward)
		}
	})
}

func TestDivideInvertsMultiply(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		left := rapid.Float64Range(-1e6, 1e6).Draw(rt, "left")
		right := rapid.Float64Range(-1e6, 1e6).
			Filter(func(value float64) bool { return math.Abs(value) >= 1e-3 }).
			Draw(rt, "right")

		quotient := calculate(rt, service, "divide", left, right)
		if recovered := calculate(rt, service, "multiply", quotient, right); !closeEnough(recovered, left, 1e-12) {
			rt.Fatalf("multiply(divide(%v, %v), %v) = %v", left, right, right, recovered)
		}
	})
}

func TestSqrtSquaresBack(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		value := rapid.Float64Range(0, 1e100).
			Filter(func(value float64) bool { return value == 0 || value >= 1e-300 }).
			Draw(rt, "value")

		root := calculate(rt, service, "sqrt", value)
		if squared := calculate(rt, service, "multiply", root, root); !closeEnough(squared, value, 1e-12) {
			rt.Fatalf("sqrt(%v)^2 = %v", value, squared)
		}
	})
}

func TestPercentIsOneHundredth(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		value := rapid.Float64Range(-1e100, 1e100).Draw(rt, "value")

		if got, want := calculate(rt, service, "percent", value), value/100; got != want {
			rt.Fatalf("percent(%v) = %v, want %v", value, got, want)
		}
	})
}

func TestPowerIdentities(t *testing.T) {
	t.Parallel()

	service := NewService()
	rapid.Check(t, func(rt *rapid.T) {
		base := rapid.Float64Range(-1e6, 1e6).
			Filter(func(value float64) bool { return value != 0 }).
			Draw(rt, "base")

		if got := calculate(rt, service, "power", base, 0); got != 1 {
			rt.Fatalf("power(%v, 0) = %v, want 1", base, got)
		}
		if got := calculate(rt, service, "power", base, 1); got != base {
			rt.Fatalf("power(%v, 1) = %v, want %v", base, got, base)
		}

		exponent := rapid.IntRange(2, 8).Draw(rt, "exponent")
		if got := calculate(rt, service, "power", base, float64(exponent)); !closeEnough(got, math.Pow(base, float64(exponent)), 1e-12) {
			rt.Fatalf("power(%v, %d) = %v, want %v", base, exponent, got, math.Pow(base, float64(exponent)))
		}
	})
}
