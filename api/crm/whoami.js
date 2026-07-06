// ============================================================================
//  api/crm/whoami.js  —  TESTE DE CONEXÃO (smoke test)
//  ----------------------------------------------------------------------------
//  Não lê dado de negócio nenhum. Só prova que a ponte está de pé:
//    1) consegue pegar um token no Entra ID (app registration OK), e
//    2) o Dataverse reconhece esse app como application user (Fase 2 OK).
//  Se devolver { ok: true, ... } com um UserId, a autenticação está sólida
//  e a gente segue pro Passo 2. Descarte/desative este arquivo depois.
// ============================================================================

const TOKEN_HOST = "https://login.microsoftonline.com";

async function getToken() {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, DATAVERSE_URL } = process.env;

  const faltando = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET", "DATAVERSE_URL"]
    .filter((k) => !process.env[k]);
  if (faltando.length) {
    throw new Error(`Variáveis de ambiente faltando na Vercel: ${faltando.join(", ")}`);
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: `${DATAVERSE_URL}/.default`,
  });

  const res = await fetch(`${TOKEN_HOST}/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    // Erro aqui = problema de app registration / secret / tenant (Fase 1).
    throw new Error(`Entra recusou o token (${res.status}): ${json.error_description || json.error}`);
  }
  return json.access_token;
}

module.exports = async (req, res) => {
  try {
    const token = await getToken();

    const r = await fetch(`${process.env.DATAVERSE_URL}/api/data/v9.2/WhoAmI`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    });

    if (!r.ok) {
      const texto = await r.text();
      // 401/403 aqui = token OK, mas o Dataverse não autorizou.
      // Quase sempre: application user não criado ou sem security role (Fase 2).
      return res.status(r.status).json({
        ok: false,
        etapa: "Dataverse recusou (token foi obtido com sucesso)",
        dica: "Confira o application user e o security role no Power Platform (Fase 2).",
        status: r.status,
        detalhe: texto,
      });
    }

    const who = await r.json();
    return res.status(200).json({
      ok: true,
      mensagem: "Conexão Microsoft ↔ Dataverse funcionando. Pode seguir pro Passo 2.",
      userId: who.UserId,
      organizationId: who.OrganizationId,
      businessUnitId: who.BusinessUnitId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, etapa: "Falha antes do Dataverse", erro: e.message });
  }
};
