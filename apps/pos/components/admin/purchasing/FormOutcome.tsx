/** The refusal or confirmation under a back-office form, as every M26–M28 form prints it. */
export function FormOutcome({
  state,
}: {
  readonly state: { readonly error: string | null; readonly message: string | null };
}) {
  return (
    <>
      {state.error && (
        <p role="alert" className="text-danger mt-3 text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-ok mt-3 text-sm">
          {state.message}
        </p>
      )}
    </>
  );
}
