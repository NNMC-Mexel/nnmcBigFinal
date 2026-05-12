export function isProductionBoardStage(stage: any): boolean {
  if (!stage) return false;

  const order = Number(stage.order);
  if (Number.isFinite(order) && order >= 5) {
    return true;
  }

  const name = [
    stage.key,
    stage.name,
    stage.name_ru,
    stage.name_kz,
    stage.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return name.includes('production')
    || name.includes('промышлен')
    || name.includes('эксплуатац')
    || name.includes('өндір');
}
