import { generateSecretKey, getPublicKey } from "nostr-tools";

const privateKeyBytes = generateSecretKey();
const privateKeyHex = Buffer.from(privateKeyBytes).toString("hex");
const publicKeyHex = getPublicKey(privateKeyBytes);

console.log(
  JSON.stringify(
    {
      privateKeyHex,
      publicKeyHex,
    },
    null,
    2,
  ),
);
