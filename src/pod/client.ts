import { Session } from "@inrupt/solid-client-authn-node";

export class PodClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly session: Session) {
    this.fetchFn = session.fetch;
  }

  async assertReadable(url: string): Promise<void> {
    const response = await this.fetchFn(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Unable to read ${url} (HTTP ${response.status}).`);
    }
  }

  async ensureContainer(containerUrl: string): Promise<void> {
    const probeResponse = await this.fetchFn(containerUrl, { method: "HEAD" });

    if (probeResponse.ok) {
      return;
    }

    if (probeResponse.status !== 404) {
      throw new Error(
        `Unable to inspect container ${containerUrl} (HTTP ${probeResponse.status}).`
      );
    }

    const createResponse = await this.fetchFn(containerUrl, { method: "MKCOL" });

    if (!createResponse.ok && createResponse.status !== 405 && createResponse.status !== 409) {
      throw new Error(
        `Unable to create container ${containerUrl} (HTTP ${createResponse.status}).`
      );
    }
  }

  async listResourceUrls(containerUrl: string): Promise<string[]> {
    const response = await this.fetchFn(containerUrl, {
      method: "GET",
      headers: {
        Accept: "text/turtle"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Unable to list resources in ${containerUrl} (HTTP ${response.status}).`
      );
    }

    const turtleBody = await response.text();
    return this.extractContainedUrls(turtleBody);
  }

  async readTextResource(resourceUrl: string): Promise<string> {
    const response = await this.fetchFn(resourceUrl, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Unable to read resource ${resourceUrl} (HTTP ${response.status}).`);
    }

    return response.text();
  }

  async writeTextResource(
    resourceUrl: string,
    content: string,
    contentType = "text/plain"
  ): Promise<void> {
    const response = await this.fetchFn(resourceUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: content
    });

    if (!response.ok) {
      throw new Error(`Unable to write resource ${resourceUrl} (HTTP ${response.status}).`);
    }
  }

  private extractContainedUrls(turtleBody: string): string[] {
    const matches = turtleBody.matchAll(/ldp:contains\s+<([^>]+)>/g);
    const urls = new Set<string>();

    for (const match of matches) {
      const resourceUrl = match[1]?.trim();
      if (resourceUrl) {
        urls.add(resourceUrl);
      }
    }

    return [...urls];
  }
}