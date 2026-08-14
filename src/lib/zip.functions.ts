import { createServerFn } from "@tanstack/react-start";

import { generateDriveByVibe, type VibeInput } from "./zip.server";

export const getDriveByVibe = createServerFn({ method: "POST" })
  .inputValidator((input: VibeInput) => input)
  .handler(async ({ data }) => {
    return await generateDriveByVibe(data);
  });
