// ============================================================================
//  api/crm/pipeline.js  —  Funil Dynamics 365 Sales (oportunidades + leads)
//  ----------------------------------------------------------------------------
//  Autenticação Server-to-Server (client credentials), igual ao whoami.js.
//  Cada consulta é isolada: se uma coluna não existir, reporta em "errors" e as
//  outras continuam.
//
//  MODO DESCOBERTA: acesse /api/crm/pipeline?discover=1 para receber, além do
//  funil, um registro completo (todas as colunas) de 1 oportunidade e 1 lead —
//  é assim que descobrimos os nomes internos dos campos customizados
//  (valor de compra/venda/lucro, Linha de Negócio, etc.).
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

    // ---- Oportunidades ----
    try {
      const sel = [
        "name", "estimatedvalue", "actualvalue", "estimatedclosedate",
        "closeprobability", "statecode", "statuscode", "createdon", "_ownerid_value",
      ].join(",");
      out.opportunities = await query(token, `opportunities?$select=${sel}&$orderby=createdon desc&$top=1000`);
    } catch (e) {
      out.errors.push(`opportunities: ${e.message}`);
    }

    // ---- Leads ----
    try {
      const sel = [
        "subject", "fullname", "companyname", "jobtitle", "leadsourcecode",
        "leadqualitycode", "statecode", "statuscode", "createdon", "_ownerid_value",
      ].join(",");
      out.leads = await query(token, `leads?$select=${sel}&$orderby=createdon desc&$top=1000`);
    } catch (e) {
      out.errors.push(`leads: ${e.message}`);
    }

    // ---- Modo descoberta: 1 registro completo de cada (revela campos customizados) ----
    if (req.query && (req.query.discover || req.query.debug)) {
      try { const o = await query(token, `opportunities?$top=1`); out.sampleOpportunity = o[0] || null; }
      catch (e) { out.errors.push(`sampleOpportunity: ${e.message}`); }
      try { const l = await query(token, `leads?$top=1`); out.sampleLead = l[0] || null; }
      catch (e) { out.errors.push(`sampleLead: ${e.message}`); }
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, etapa: "Falha na autenticação", erro: e.message });
  }
};
