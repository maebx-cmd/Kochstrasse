const f = (url, opt = {}) => { const {agent, ...rest} = opt; return globalThis.fetch(url, rest); };
export {f as fetch};
export const Request = globalThis.Request;
export default f;
