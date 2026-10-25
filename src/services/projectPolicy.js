export const PROJECT_WRITE_POLICY = Object.freeze({
  create: true,
  delete: false,
  move: false,
  editExisting: true,
});

export function assertProjectWriteAllowed(operation) {
  if (PROJECT_WRITE_POLICY[operation] === true) return;
  throw new Error("Project deletion and moving between project types are not authorized.");
}
