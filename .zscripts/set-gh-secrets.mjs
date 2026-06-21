import _sodium from "libsodium-wrappers";
import { readFileSync } from "fs";

async function main() {
  const envFile = readFileSync("/home/z/my-project/.env.deploy", "utf-8");
  const env = {};
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2];
  }

  await _sodium.ready;
  const sodium = _sodium;

  const ghToken = env.GITHUB_TOKEN;
  const keyRes = await fetch(
    "https://api.github.com/repos/synclicen/LIHUM/actions/secrets/public-key",
    {
      headers: {
        Authorization: `token ${ghToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  const keyData = await keyRes.json();
  console.log("Public key fetched:", keyData.key_id);

  const publicKey = sodium.from_base64(
    keyData.key,
    sodium.base64_variants.ORIGINAL
  );
  const keyId = keyData.key_id;

  const secrets = {
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
    DATABASE_URL: "libsql://lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io",
  };

  for (const [name, value] of Object.entries(secrets)) {
    const messageBytes = sodium.from_string(value);
    const encrypted = sodium.crypto_box_seal(messageBytes, publicKey);
    const encryptedB64 = sodium.to_base64(
      encrypted,
      sodium.base64_variants.ORIGINAL
    );

    const putRes = await fetch(
      `https://api.github.com/repos/synclicen/LIHUM/actions/secrets/${name}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${ghToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          encrypted_value: encryptedB64,
          key_id: keyId,
        }),
      }
    );

    if (putRes.status === 201 || putRes.status === 204) {
      console.log(`✓ Secret set: ${name}`);
    } else {
      const err = await putRes.text();
      console.log(`✗ Failed to set ${name}: ${putRes.status} ${err}`);
    }
  }

  console.log("\nDone. Remaining secret needed: CLOUDFLARE_ACCOUNT_ID");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
