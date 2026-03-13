export function parseToolResult<T>(result: Promise<unknown>): Promise<T>;
export function parseToolResult<T>(result: unknown): T;
export function parseToolResult<T>(result: Promise<unknown> | unknown): Promise<T> | T {
  if (result instanceof Promise) {
    return result.then((value) => parseToolResult<T>(value));
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent
  ) {
    return result.structuredContent as T;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "isError" in result &&
    result.isError === true
  ) {
    throw new Error(`Tool call failed: ${extractTextContent(result)}`);
  }

  const textContent = extractTextContent(result);
  if (textContent) {
    try {
      return JSON.parse(textContent) as T;
    } catch (error) {
      throw new Error(
        `Expected structuredContent or JSON text in tool result; received text: ${textContent}`,
        { cause: error },
      );
    }
  }

  throw new Error("Expected structuredContent or JSON text in tool result");
}

function extractTextContent(result: unknown): string | undefined {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return undefined;
  }

  const textPart = result.content.find((item) =>
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "text" &&
    "text" in item &&
    typeof item.text === "string"
  );

  return textPart?.text;
}
