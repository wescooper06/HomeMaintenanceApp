export const PROJECT_WRITE_POLICY = Object.freeze({
  create: true,
  delete: false,
  deleteWorkbench: true,
  move: false,
  editExisting: true,
});

export function assertProjectWriteAllowed(operation) {
  if (PROJECT_WRITE_POLICY[operation] === true) return;
  throw new Error("This project operation is not authorized.");
}
