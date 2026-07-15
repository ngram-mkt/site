const REDIRECT_BASE = '/LBE-2026/';
const HUBSPOT_PORTAL_ID = '45616811';
const HUBSPOT_FORM_GUID = '2b3a9abf-3f1b-46a0-9a21-bcad62f127f7';

function toList(values) {
  return values
    .map(function (value) { return typeof value === 'string' ? value.trim() : ''; })
    .filter(Boolean);
}

function buildNoteBody(data) {
  return [
    'Novo envio do formulário Neurogram',
    '',
    'Nome: ' + (data.name || '-'),
    'Telefone: ' + (data.phone || '-'),
    'E-mail: ' + (data.email || '-'),
    'Tipo de EEG: ' + (data.eegType || '-'),
    'Quantidade de laudos mensal: ' + (data.monthlyReports || '-'),
    'Aparelhos: ' + (data.equipment || '-'),
    'Palavra/frase: ' + (data.phrase || '-'),
  ].join('\n');
}

function redirect(query) {
  return {
    statusCode: 303,
    headers: { Location: REDIRECT_BASE + query },
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return redirect('?error=1');
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const params = new URLSearchParams(rawBody);

  const name = (params.get('name') || '').trim();
  const phone = (params.get('phone') || '').trim();
  const email = (params.get('email') || '').trim();
  const monthlyReports = (params.get('monthlyReports') || '').trim();
  const phrase = (params.get('phrase') || '').trim();
  const eegTypeList = toList(params.getAll('eegType'));
  const equipmentList = toList(params.getAll('equipment'));
  const eegType = eegTypeList.join(', ');
  const equipment = equipmentList.join(', ');

  if (!name || !phone || !email || !monthlyReports || !phrase) {
    return redirect('?error=1');
  }

  try {
    // Upsert (create-or-update) by email so resubmissions from the same
    // person/test don't fail with a 409 "contact already exists" conflict.
    const contactResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [
          {
            idProperty: 'email',
            id: email,
            properties: {
              firstname: name,
              phone: phone,
              email: email,
              eeg_type: eegTypeList.join(';'),
              monthly_reports: monthlyReports,
              equipment: equipmentList.join(';'),
              phrase: phrase,
            },
          },
        ],
      }),
    });

    if (!contactResponse.ok) {
      const errBody = await contactResponse.text();
      console.error('[hubspot] contact upsert failed (' + contactResponse.status + '): ' + errBody);
      return redirect('?error=1');
    }

    const upsertResult = await contactResponse.json();
    const contactId = upsertResult.results && upsertResult.results[0] && upsertResult.results[0].id;

    if (contactId) {
      const noteResponse = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: buildNoteBody({
              name: name,
              phone: phone,
              email: email,
              eegType: eegType,
              monthlyReports: monthlyReports,
              equipment: equipment,
              phrase: phrase,
            }),
            hs_timestamp: String(Date.now()),
          },
          associations: [
            {
              to: { id: contactId },
              types: [
                { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 },
              ],
            },
          ],
        }),
      });

      if (!noteResponse.ok) {
        const errBody = await noteResponse.text();
        console.error('[hubspot] note creation failed (' + noteResponse.status + '): ' + errBody);
      }
    }

    // Also submit to the HubSpot form itself so this registers as a real
    // "form submission" event (timeline + form analytics + workflow
    // triggers), on top of the direct contact/note calls above. The contact
    // already exists by this point, so this just attaches the submission.
    try {
      const formSubmitUrl =
        'https://api.hsforms.com/submissions/v3/integration/submit/' +
        HUBSPOT_PORTAL_ID + '/' + HUBSPOT_FORM_GUID;

      const formResponse = await fetch(formSubmitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [
            { name: 'firstname', value: name },
            { name: 'phone', value: phone },
            { name: 'email', value: email },
            { name: 'eeg_type', value: eegTypeList.join(';') },
            { name: 'monthly_reports', value: monthlyReports },
            { name: 'equipment', value: equipmentList.join(';') },
            { name: 'phrase', value: phrase },
          ],
          context: {
            pageUri: 'https://neurogram.com/LBE-2026',
            pageName: 'LBE 2026 - Cadastro Neurogram',
          },
        }),
      });

      if (!formResponse.ok) {
        const errBody = await formResponse.text();
        console.error('[hubspot] form submission failed (' + formResponse.status + '): ' + errBody);
      }
    } catch (err) {
      console.error('[hubspot] form submission unexpected error: ' + (err && err.stack ? err.stack : err));
    }

    return redirect('?submitted=1');
  } catch (err) {
    console.error('[hubspot] unexpected error: ' + (err && err.stack ? err.stack : err));
    return redirect('?error=1');
  }
};
