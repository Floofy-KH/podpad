import { PodConfig } from "../utils/config";
import { PodClient } from "./client";

export async function bootstrapPodContainers(
  podClient: PodClient,
  podConfig: PodConfig
): Promise<void> {
  await podClient.assertReadable(podConfig.podBaseUrl);
  await podClient.ensureContainer(podConfig.notesContainerUrl);
  await podClient.ensureContainer(podConfig.summariesContainerUrl);
}