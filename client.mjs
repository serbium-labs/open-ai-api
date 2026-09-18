async function readJsonResponse(response) {
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

export async function fetchCodeFiles(fetchImpl = fetch) {
  const response = await fetchImpl("/api/code");
  const body = await readJsonResponse(response);
  return body.files;
}

export async function submitPrompt(prompt, fetchImpl = fetch) {
  const response = await fetchImpl("/api/codex", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  const body = await readJsonResponse(response);
  return body.finalResponse;
}

export async function submitAndRefresh(
  prompt,
  {
    fetchImpl = fetch,
    onFinalResponse = () => {},
    onCodeFiles = () => {},
  } = {},
) {
  const finalResponse = await submitPrompt(prompt, fetchImpl);
  onFinalResponse(finalResponse);

  const files = await fetchCodeFiles(fetchImpl);
  onCodeFiles(files);

  return { finalResponse, files };
}
