const text = "architectural lighting alliance (ala) is a manufacturer's representative agency based in dallas, texas, established in 1945. the company specializes in high-quality architectural and commodity lighting solutions, serving the architectural, design, engineering, and construction sectors primarily in north texas.";

function hasStrongManufacturersRepSignals(text) {
  return /(manufacturers?('s?)?\s+rep(?:resentative)?|manufacturers?('s?)?\s+representative agency|rep firm|lighting rep|electrical rep|sales rep agency|independent sales representative|represents? manufacturers?|working with distributors|electrical contractors|engineers|architects|lighting designers)/i.test(text);
}

function hasStrongManufacturingSignals(text) {
  return /(manufactur|fabricat|weld|foundry|assembly (?:plant|line|facility))/i.test(text);
}

console.log("hasStrongManufacturersRepSignals:", hasStrongManufacturersRepSignals(text));
console.log("hasStrongManufacturingSignals:", hasStrongManufacturingSignals(text));
