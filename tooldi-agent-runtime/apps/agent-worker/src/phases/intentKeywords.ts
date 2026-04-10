export const menuDrivenPhotoSignalKeywords = new Set([
  "메뉴",
  "신메뉴",
  "시즌메뉴",
  "계절메뉴",
  "음료",
  "커피",
  "콜드브루",
  "라떼",
  "에이드",
  "브런치",
  "요리",
  "식사",
  "런치",
]);

export const fashionRetailBlockedKeywords = new Set([
  ...menuDrivenPhotoSignalKeywords,
  "식당",
  "레스토랑",
  "카페",
]);

export const menuDrivenPhotoSignalPattern =
  /메뉴|음료|커피|콜드브루|라떼|에이드|브런치|요리|식사|런치/u;

export const fashionRetailBlockedTextPattern =
  /메뉴|음료|커피|콜드브루|라떼|에이드|브런치|요리|식사|런치|식당|레스토랑|카페/u;

export const genericPromoBlockedKeywords = new Set([
  ...menuDrivenPhotoSignalKeywords,
  "식당",
  "레스토랑",
  "카페",
  "패션",
  "리테일",
  "의류",
  "브랜드",
  "쇼핑",
  "스타일",
]);
