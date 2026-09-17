// ============================================================================
//  api/crm/pipeline.js  —  PASSO 2: dados do funil (Dynamics 365 Sales)
//  ----------------------------------------------------------------------------
//  Puxa Oportunidades e Leads do Dataverse (tabelas padrão do Sales) e devolve
//  JSON já com os rótulos legíveis (status, dono, moeda) via annotations.
//  Mesma autenticação Server-to-Server do whoami.js (client credentials).
//
//  Cada consulta é isolada num try/catch: se uma coluna não existir no ambiente
//  de vocês, aquela consulta reporta o erro em "errors" mas a outra continua —
//  assim dá pra ver exatamente o que ajustar sem quebrar tudo.
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
    throw new Error(`Entra recusou o token (${res.status}): ${json.error_description || json.error}`);
  }
  return json.access_token;
}

async function query(token, path) {
  const r = await fetch(`${process.env.DATAVERSE_URL}/api/data/v9.2/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      // Traz os rótulos legíveis (status/dono/moeda) junto dos valores crus
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Dataverse ${r.status} em "${path.split("?")[0]}": ${text.slice(0, 300)}`);
  return (JSON.parse(text).value) || [];
}

module.exports = async (req, res) => {
  const out = { ok: true, opportunities: [], leads: [], errors: [] };
  try {
    const token = await getToken();

    // ---- Oportunidades (tabela padrão: opportunities) ----
    try {
      const sel = [
        "name", "estimatedvalue", "actualvalue", "estimatedclosedate",
        "closeprobability", "statecode", "statuscode", "createdon", "_ownerid_value",
      ].join(",");
      out.opportunities = await query(token, `opportunities?$select=${sel}&$orderby=createdon desc&$top=1000`);
    } catch (e) {
      out.errors.push(`opportunities: ${e.message}`);
    }

    // ---- Leads (tabela padrão: leads) ----
    try {
      const sel = [
        "subject", "fullname", "companyname", "estimatedamount",
        "leadqualitycode", "statecode", "statuscode", "createdon", "_ownerid_value",
      ].join(",");
      out.leads = await query(token, `leads?$select=${sel}&$orderby=createdon desc&$top=1000`);
    } catch (e) {
      out.errors.push(`leads: ${e.message}`);
    }

    // cache leve na borda da Vercel (60s) — evita martelar o Dataverse
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, etapa: "Falha na autenticação", erro: e.message });
  }
};
