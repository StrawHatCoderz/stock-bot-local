const readJson = (res: Response) => res.json();

export const apiGet = (path: string, headers?: Record<string, string>) =>
  fetch(path, { headers }).then(readJson);

const postArgs = (data: unknown, headers?: Record<string, string>) => ({
  method: "post",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(data),
});

export const apiPost = (path: string, data: unknown, headers?: Record<string, string>) =>
  fetch(path, postArgs(data, headers)).then(readJson);
