import { NotImplementedError } from "./errors";

// Stub handlers throw the contract-declared `NOT_IMPLEMENTED` error until the
// corresponding data access and orchestration logic lands.
export const notImplemented = (): never => {
    throw new NotImplementedError();
};
