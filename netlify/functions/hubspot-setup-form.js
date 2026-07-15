// One-time setup endpoint: creates the HubSpot form used to register a
// real "form submission" event for LBE-2026 leads (in addition to the
// direct contact/note API calls hubspot.js already does).
// Visit /.netlify/functions/hubspot-setup-form once, then it prints the
// portalId + formGuid to wire into hubspot.js.

const DEFAULT_VALIDATION = {
  blockedEmailDomains: [],
  useDefaultBlockList: false,
  minAllowedDigits: 0,
  maxAllowedDigits: 40,
};

function field(name, label, fieldType, required, validation) {
  return {
    objectTypeId: '0-1',
    name: name,
    label: label,
    fieldType: fieldType,
    required: !!required,
    hidden: false,
    validation: validation || DEFAULT_VALIDATION,
  };
}

const FIELD_GROUPS = [
  { groupType: 'default_group', richTextType: 'text', fields: [field('firstname', 'Nome', 'single_line_text', true)] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('phone', 'Telefone', 'phone', true, { blockedEmailDomains: [], useDefaultBlockList: false, minAllowedDigits: 8, maxAllowedDigits: 15 })] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('email', 'E-mail', 'email', true)] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('eeg_type', 'Tipo de EEG', 'multiple_checkboxes', false)] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('monthly_reports', 'Quantidade de laudos mensal', 'number', false)] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('equipment', 'Aparelhos que trabalha', 'multiple_checkboxes', false)] },
  { groupType: 'default_group', richTextType: 'text', fields: [field('phrase', 'Palavra/frase', 'single_line_text', false)] },
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
          cloneable: true,
          editable: true,
          archivable: true,
          recaptchaEnabled: false,
          notifyContactOwner: false,
          notifyRecipients: [],
          createNewContactForNewEmail: true,
          prefillEnabled: true,
          allowLinkToResetKnownValues: false,
          postSubmitAction: { type: 'thank_you', value: 'Formulário enviado com sucesso' },
        },
        displayOptions: {
          renderRawHtml: false,
          theme: 'default_style',
          submitButtonText: 'Enviar',
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
