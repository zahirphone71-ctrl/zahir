export const HOTSPOT_OPTIONAL_FALLBACK_KEYS = [
  "transparent-proxy",
  "insert-queue-before",
  "queue-type",
  "parent-queue",
  "open-status-page",
  "advertise",
  "advertise-url",
  "advertise-interval",
  "advertise-timeout",
  "incoming-filter",
  "outgoing-filter",
  "address-list",
  "status-autorefresh",
  "mac-cookie-timeout",
  "keepalive-timeout",
  "idle-timeout",
  "session-timeout",
  "address-pool",
  "on-logout",
  "on-login"
];

export const PPP_OPTIONAL_FALLBACK_KEYS = [
  "remote-ipv6-prefix-pool",
  "use-ipv6",
  "use-mpls",
  "use-compression",
  "use-encryption",
  "bridge-horizon",
  "bridge",
  "queue-type",
  "parent-queue",
  "wins-server",
  "dns-server",
  "address-list",
  "session-timeout",
  "idle-timeout",
  "on-down",
  "on-up",
  "comment"
];

export const USERMAN_LIM_OPTIONAL_KEYS = [
  "owner",
  "rate-limit-min-rx",
  "rate-limit-min-tx",
  "transfer-limit",
  "download-limit",
  "upload-limit",
  "uptime-limit",
  "rate-limit-rx",
  "rate-limit-tx"
];

export const USERMAN_PROF_OPTIONAL_KEYS = [
  "owner",
  "comment",
  "starts-when",
  "starts-at",
  "override-shared-users",
  "name-for-users",
  "validity",
  "price"
];

export const USERMAN_LINK_OPTIONAL_KEYS = ["weekdays", "from-time", "till-time"];
