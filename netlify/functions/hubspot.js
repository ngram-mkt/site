const REDIRECT_BASE = '/LBE-2026/';

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
  const eegType = toList(params.getAll('eegType')).join(', ');
  const equipment = toList(params.getAll('equipment')).join(', ');

  if (!name || !phone || !email || !monthlyReports || !phrase) {
    return redirect('?error=1');
  }

  try {
    const contactResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { firstname: name, phone: phone, email: email },
      }),
    });

    if (!contactResponse.ok) {
      return redirect('?error=1');
    }

    const contact = await contactResponse.json();
    const contactId = contact.id;

    if (contactId) {
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
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
    }

    return redirect('?submitted=1');
  } catch (err) {
    return redirect('?error=1');
  }
};
