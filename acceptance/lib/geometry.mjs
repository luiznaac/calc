const SAME_COLUMN_TOLERANCE = 3;
const SAME_COLUMN_RATIO = 0.08;
const VERTICAL_TOLERANCE = 2;
const VERTICAL_RATIO = 0.06;
const FUNCTION_OVERLAP = 2;

function sameColumn(upper, lower) {
  return (
    Math.abs(upper.centerX - lower.centerX) <=
    Math.max(SAME_COLUMN_TOLERANCE, lower.width * SAME_COLUMN_RATIO)
  );
}

function isAbove(upper, lower) {
  return (
    upper.bottom <= lower.top + Math.max(VERTICAL_TOLERANCE, lower.height * VERTICAL_RATIO) &&
    sameColumn(upper, lower)
  );
}

function isFunctionAbove(key, digit) {
  return key.bottom <= digit.top + FUNCTION_OVERLAP && key.top < digit.top;
}

function isRightOf(operator, digit) {
  return operator.centerX > digit.right;
}

export function evaluateRelations(relations, boxes) {
  return relations.map((relation) => {
    const [key] = Object.keys(relation);
    const [first, second] = relation[key];
    const upper = boxes[first];
    const lower = boxes[second];
    if (!upper || !lower) {
      return { relation: `${first} ${key} ${second}`, passed: false };
    }
    let passed = false;
    if (key === "above") passed = isAbove(upper, lower);
    if (key === "functionAbove") passed = isFunctionAbove(upper, lower);
    if (key === "rightOf") passed = isRightOf(upper, lower);
    return { relation: `${first} ${key} ${second}`, passed };
  });
}
