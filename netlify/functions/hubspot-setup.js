// One-time setup endpoint: creates the custom contact properties used by
// hubspot.js. Safe to call more than once — skips properties that already
// exist. Visit /.netlify/functions/hubspot-setup once after deploy.

const PROPERTIES = [
  {
    name: 'eeg_type',
    label: 'Tipo de EEG',
    type: 'enumeration',
    fieldType: 'checkbox',
    groupName: 'contactinformation',
    options: [
      { label: 'VEEG', value: 'VEEG' },
      { label: 'UTI', value: 'UTI' },
      { label: 'Rotina', value: 'Rotina' },
    ],
  },
  {
    name: 'monthly_reports',
    label: 'Quantidade de laudos mensal',
    type: 'number',
    fieldType: 'number',
    groupName: 'contactinformation',
  },
  {
    name: 'equipment',
    label: 'Aparelhos que trabalha',
    type: 'enumeration',
    fieldType: 'checkbox',
    groupName: 'contactinformation',
    options: [
      { label: 'EMSA', value: 'EMSA' },
      { label: 'Neurosoft', value: 'Neurosoft' },
      { label: 'Neurovirtual', value: 'Neurovirtual' },
      { label: 'Neurotec', value: 'Neurotec' },
      { label: 'Nihon', value: 'Nihon' },
    ],
  },
  {
    name: 'phrase',
    label: 'Palavra/frase (LBE 2026)',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
  },
];

exports.handler = async function () {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'HUBSPOT_PRIVATE_APP_TOKEN not set' }),
    };
  }

  const results = [];

  for (const prop of PROPERTIES) {
    try {
      const response = await fetch('https://api.hubapi.com/crm/v3/properties/contacts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prop),
      });

      if (response.status === 409) {
        results.push({ name: prop.name, status: 'already exists' });
      } else if (!response.ok) {
        const errBody = await response.text();
        results.push({ name: prop.name, status: 'error', detail: errBody.slice(0, 300) });
      } else {
        results.push({ name: prop.name, status: 'created' });
      }
    } catch (err) {
      results.push({ name: prop.name, status: 'error', detail: String(err) });
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results, null, 2),
  };
};
