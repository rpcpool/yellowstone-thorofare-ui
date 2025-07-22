interface ParsedVersion {
  version: string;
  solana: string;
  hostname?: string;
  package?: string;
  git?: string;
}

export const parseVersion = (versionString?: string): ParsedVersion => {
  if (!versionString) {
    return {
      version: "Unknown",
      solana: "Unknown",
    };
  }

  try {
    const parsed = JSON.parse(versionString);
    const versionData = parsed.version || parsed;
    const extraData = parsed.extra || {};

    return {
      version:
        versionData.version?.split("+")[0] || versionData.version || "Unknown",
      solana: versionData.solana || "Unknown",
      hostname: extraData.hostname,
      package: versionData.package,
      git: versionData.git,
    };
  } catch {
    const versionMatch = versionString.match(/v?(\d+\.\d+\.\d+)/);
    return {
      version: versionMatch ? versionMatch[1] : "Unknown",
      solana: "Unknown",
    };
  }
};


export const formatVersionDisplay = (versionString: string): string => {
  const parsed = parseVersion(versionString);
  if (parsed.version === "Unknown") return "Unknown";
  return `v${parsed.version} (sol ${parsed.solana})`;
};

export const parseEndpointName = (endpoint: string): string => {
  try {
    // Add protocol if missing for URL parsing
    const urlString = endpoint.includes("://")
      ? endpoint
      : `http://${endpoint}`;
    const url = new URL(urlString);

    // Return hostname (with port if non-standard)
    if (url.port && url.port !== "80" && url.port !== "443") {
      return `${url.hostname}:${url.port}`;
    }

    return url.hostname;
  } catch {
    // If parsing fails, try to remove just the protocol
    return endpoint.replace(/^https?:\/\//, "");
  }
};
