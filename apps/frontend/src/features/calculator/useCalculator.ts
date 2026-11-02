import { useCallback, useEffect, useReducer, useRef } from "react";
import { calculate } from "./api";
import { calculatorReducer, initialState } from "./reducer";
import type { CalculatorKey } from "./types";

export function useCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, initialState);
  const issuedRequest = useRef(0);

  useEffect(() => {
    const request = state.request;
    if (request === null || request.id === issuedRequest.current) {
      return;
    }
    issuedRequest.current = request.id;
    void calculate({ operation: request.operation, operands: request.operands }).then((outcome) => {
      dispatch({ type: "settle", id: request.id, outcome });
    });
  }, [state.request]);

  const press = useCallback((key: CalculatorKey) => {
    dispatch({ type: "press", key });
  }, []);

  return { state, press };
}
