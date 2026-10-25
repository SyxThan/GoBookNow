import setupDatabase from "../../../backend/dist-browser/test/integration/helpers/global-setup.js";

// Runner cwd is apps/backend, preserving the integration guard, migration checksum
// checks and suite-level advisory lock. Released after all browser workers close.
export default async function setup() {
  return setupDatabase();
}
