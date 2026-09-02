const PRECISION = 1000;

export const parseLocaleNumber = (value: string): number => {
  if (value === null || value === undefined) return NaN;
  const cleaned = value
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=.*\.)/g, '')
    .replace(/,/g, '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
};

export const formatLocaleNumber = (value: number, decimals = 3): string => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const roundToPrecision = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * PRECISION) / PRECISION;
};

export const weightedAverage = (
  currentStock: number,
  currentCost: number,
  addedQty: number,
  addedCost: number
): number => {
  const newStock = currentStock + addedQty;
  if (newStock <= 0) return addedCost;
  const totalValue = currentStock * currentCost + addedQty * addedCost;
  return roundToPrecision(totalValue / newStock);
};

export const isDiscreteUnit = (unit: string): boolean => {
  const discreteUnits = [
    'unidad',
    'unidades',
    'u',
    'uds',
    'ud',
    'paquete',
    'paquetes',
    'pkg',
    'caja',
    'cajas',
    'pieza',
    'piezas',
    'pza',
    'pzas',
    'docena',
    'docenas',
    'metro',
    'metros',
    'm',
  ];
  const lower = unit.toLowerCase().trim();
  return discreteUnits.some((u) => lower === u || lower.startsWith(u + ' ') || lower.endsWith(' ' + u));
};

export const getUnitInputConfig = (unit: string) => {
  const discrete = isDiscreteUnit(unit);
  return {
    step: discrete ? '1' : 'any',
    min: discrete ? '1' : '0.001',
    validate: (val: number) => (discrete ? Number.isInteger(val) && val > 0 : val > 0),
    placeholder: discrete ? '0' : '0.000',
  };
};