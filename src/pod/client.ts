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
    if (await this.containerExists(containerUrl)) {
      return;
    }

    const createResponse = await this.fetchFn(containerUrl, { method: "MKCOL" });
    if (!createResponse.ok && createResponse.status !== 405 && createResponse.status !== 409) {
      throw new Error(
        `Unable to create container ${containerUrl} (HTTP ${createResponse.status}).`
      );
    }

    if (await this.containerExists(containerUrl)) {
      return;
    }

    // Fallback for providers that do not support MKCOL and expect LDP POST on parent.
    const normalizedUrl = containerUrl.endsWith("/") ? containerUrl.slice(0, -1) : containerUrl;
    const slashIndex = normalizedUrl.lastIndexOf("/");

    if (slashIndex <= "https://".length) {
      throw new Error(`Invalid container URL: ${containerUrl}`);
    }

    const parentUrl = `${normalizedUrl.slice(0, slashIndex + 1)}`;
    const slug = normalizedUrl.slice(slashIndex + 1);

    const postCreateResponse = await this.fetchFn(parentUrl, {
      method: "POST",
      headers: {
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
        Slug: slug,
        "Content-Type": "text/turtle"
      },
      body: ""
    });

    if (!postCreateResponse.ok && postCreateResponse.status !== 409) {
      throw new Error(
        `Unable to create container ${containerUrl} via parent POST (HTTP ${postCreateResponse.status}).`
      );
    }

    if (!(await this.containerExists(containerUrl))) {
      throw new Error(`Container ${containerUrl} is still not accessible after bootstrap attempts.`);
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

  private async containerExists(containerUrl: string): Promise<boolean> {
    const response = await this.fetchFn(containerUrl, {
      method: "GET",
      headers: {
        Accept: "text/turtle"
      }
    });

    if (response.ok) {
      return true;
    }

    if (response.status === 404) {
      return false;
    }

    throw new Error(`Unable to inspect container ${containerUrl} (HTTP ${response.status}).`);
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