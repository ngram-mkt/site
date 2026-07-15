// One-time setup endpoint: creates the HubSpot form used to register a
// real "form submission" event for LBE-2026 leads (in addition to the
// direct contact/note API calls hubspot.js already does).
// Visit /.netlify/functions/hubspot-setup-form once, then it prints the
// portalId + formGuid to wire into hubspot.js.

const FIELD_GROUPS = [
  {
    fields: [
      { objectTypeId: '0-1', name: 'firstname', label: 'Nome', fieldType: 'single_line_text', required: true },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'phone', label: 'Telefone', fieldType: 'phone', required: true },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'email', label: 'E-mail', fieldType: 'email', required: true },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'eeg_type', label: 'Tipo de EEG', fieldType: 'checkbox', required: false },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'monthly_reports', label: 'Quantidade de laudos mensal', fieldType: 'number', required: false },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'equipment', label: 'Aparelhos que trabalha', fieldType: 'checkbox', required: false },
    ],
  },
  {
    fields: [
      { objectTypeId: '0-1', name: 'phrase', label: 'Palavra/frase', fieldType: 'single_line_text', required: false },
    ],
  },
];

exports.handler = async function () {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'HUBSPOT_PRIVATE_APP_TOKEN not set' }) };
  }

  const authHeaders = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  let portalId = null;
  try {
    const accountResponse = await fetch('https://api.hubapi.com/account-info/v3/details', {
      headers: authHeaders,
    });
    if (accountResponse.ok) {
      const account = await accountResponse.json();
      portalId = account.portalId;
    } else {
      portalId = { error: await accountResponse.text() };
    }
  } catch (err) {
    portalId = { error: String(err) };
  }

  let formResult;
  try {
    const formResponse = await fetch('https://api.hubapi.com/marketing/v3/forms', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'LBE 2026 - Cadastro Neurogram',
        formType: 'hubspot',
        fieldGroups: FIELD_GROUPS,
        configuration: {
          language: 'pt',
          createNewContactForNewEmail: true,
          editable: true,
          archivable: true,
          recaptchaEnabled: false,
        },
      }),
    });

    const body = await formResponse.text();
    if (!formResponse.ok) {
      formResult = { error: true, status: formResponse.status, detail: body };
    } else {
      const parsed = JSON.parse(body);
      formResult = { formGuid: parsed.id, raw: parsed };
    }
  } catch (err) {
    formResult = { error: true, detail: String(err) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portalId: portalId, form: formResult }, null, 2),
  };
};
