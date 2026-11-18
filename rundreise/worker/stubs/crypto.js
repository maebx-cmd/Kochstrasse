// hafas-client erzeugt beim Laden eine Zufalls-ID; Workers erlaubt das nicht im globalen Scope.
export const randomBytes = (n) => ({ toString: () => 'a1b2c3'.slice(0, n * 2) });
export default { randomBytes };
