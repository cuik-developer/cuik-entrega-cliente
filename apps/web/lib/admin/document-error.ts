/** Error with a Spanish message for the user and an HTTP status (documents and periods). */
export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}
