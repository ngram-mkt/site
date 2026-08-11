type DealRecord = {
  id: string;
  dealname?: string;
  dealstage?: string;
  pipeline?: string;
  hubspot_owner_id?: string;
};

type TaskRecord = {
  id: string;
  hs_task_subject?: string;
  hs_task_body?: string;
  hs_task_status?: string;
  hs_timestamp?: string;
  hs_lastmodifieddate?: string;
  hs_createdate?: string;
};

type StageConfig = {
  stageId: string;
  nextStageId?: string;
  statusProperty?: string;
  statusValue?: string;
  taskSubject: string;
  taskBody: string;
  matchers: string[];
  createTask?: boolean;
};

const HUBSPOT_PIPELINE_ID = '920781441';
const DEAL_TASK_ASSOCIATION_TYPE_ID = 216;
const DEAL_TASK_STATUS_COMPLETED = 'COMPLETED';

const STAGES: StageConfig[] = [
  {
    stageId: '1404977723',
    nextStageId: '1404977724',
    statusProperty: 'registration_status',
    statusValue: 'in_progress',
    taskSubject: 'Onboarding: Cadastro',
    taskBody:
      'Validar se a resposta do formulário chegou completa, com os arquivos certos e sem pendências de cadastro.',
    matchers: ['onboarding: cadastro', 'formulário veio completo', 'formulario veio completo', 'cadastro'],
    createTask: true,
  },
  {
    stageId: '1404977724',
    nextStageId: '1404977725',
    statusProperty: 'technical_validation_status',
    statusValue: 'in_progress',
    taskSubject: 'Onboarding: Validação técnica',
    taskBody:
      'Validar se contato, empresa e equipamentos estão associados corretamente antes de seguir para a configuração.',
    matchers: [
      'onboarding: validação técnica',
      'validar se contato, empresa e equipamentos estão associados',
      'contato, empresa e equipamentos',
      'validação técnica',
    ],
    createTask: true,
  },
  {
    stageId: '1404977725',
    nextStageId: '1404977726',
    statusProperty: 'account_configuration_status',
    statusValue: 'in_progress',
    taskSubject: 'Onboarding: Configuração da conta',
    taskBody:
      'Criar a conta da clínica na plataforma após a conclusão das validações anteriores e liberar o avanço.',
    matchers: ['onboarding: configuração da conta', 'criar a conta da clínica', 'criar a conta', 'configuração da conta'],
    createTask: true,
  },
  {
    stageId: '1404977726',
    nextStageId: '1404977727',
    statusProperty: 'training_status',
    statusValue: 'in_progress',
    taskSubject: 'Onboarding: Treinamento',
    taskBody:
      'Conduzir o treinamento do cliente e validar se o time já consegue operar a plataforma com segurança.',
    matchers: ['onboarding: treinamento', 'treinamento'],
    createTask: true,
  },
  {
    stageId: '1404977727',
    nextStageId: '1404977728',
    statusProperty: 'hypercare_status',
    statusValue: 'active',
    taskSubject: 'Onboarding: Acompanhamento',
    taskBody:
      'Acompanhar a operação após o treinamento, checar dúvidas e garantir estabilidade no uso da plataforma.',
    matchers: ['onboarding: acompanhamento', 'acompanhamento', 'hypercare'],
    createTask: true,
  },
  {
    stageId: '1404977728',
    statusProperty: 'onboarding_outcome',
    statusValue: 'completed',
    taskSubject: 'Onboarding: Conclusão',
    taskBody:
      'Registrar a conclusão do onboarding e arquivar os próximos passos de pós-implantação.',
    matchers: ['onboarding: conclusão', 'conclusão', 'finalizado', 'finalização'],
    createTask: false,
  },
  {
    stageId: '1404977729',
    statusProperty: 'onboarding_outcome',
    statusValue: 'cancelled',
    taskSubject: 'Onboarding: Cancelamento',
    taskBody:
      'Registrar o cancelamento do onboarding e documentar o motivo para o histórico do atendimento.',
    matchers: ['onboarding: cancelamento', 'cancelamento', 'cancelado', 'perdido'],
    createTask: false,
  },
];

function getToken() {
  return (
    (globalThis as unknown as {
      Netlify?: { env?: { get?: (name: string) => string | undefined } };
      process?: { env?: { HUBSPOT_PRIVATE_APP_TOKEN?: string } };
    }).Netlify?.env?.get?.('HUBSPOT_PRIVATE_APP_TOKEN') ||
    (globalThis as unknown as {
      Netlify?: { env?: { get?: (name: string) => string | undefined } };
      process?: { env?: { HUBSPOT_PRIVATE_APP_TOKEN?: string } };
    }).process?.env?.HUBSPOT_PRIVATE_APP_TOKEN ||
    ''
  );
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: unknown) {
  return cleanText(value).toLowerCase();
}

function taskMatchesStage(task: TaskRecord, stage: StageConfig) {
  const subject = normalize(task.hs_task_subject);
  const body = normalize(task.hs_task_body);
  return stage.matchers.some((matcher) => subject.includes(matcher) || body.includes(matcher));
}

function isCompletedTask(task: TaskRecord) {
  return normalize(task.hs_task_status) === DEAL_TASK_STATUS_COMPLETED.toLowerCase();
}

function httpJson(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function hubspotFetch(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return response;
}

async function fetchAllOpenOnboardingDeals(token: string): Promise<DealRecord[]> {
  const deals: DealRecord[] = [];
  let after: string | undefined;

  do {
    const response = await hubspotFetch(token, '/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: HUBSPOT_PIPELINE_ID,
              },
            ],
          },
        ],
        properties: ['dealname', 'dealstage', 'pipeline', 'hubspot_owner_id'],
        limit: 100,
        after,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deal search failed (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    for (const result of data.results || []) {
      deals.push({
        id: result.id,
        dealname: result.properties?.dealname,
        dealstage: result.properties?.dealstage,
        pipeline: result.properties?.pipeline,
        hubspot_owner_id: result.properties?.hubspot_owner_id,
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  return deals;
}

async function fetchDealWithTasks(token: string, dealId: string) {
  const response = await hubspotFetch(
    token,
    `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,pipeline,hubspot_owner_id&associations=tasks`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error(`Deal fetch failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function fetchTask(token: string, taskId: string): Promise<TaskRecord> {
  const response = await hubspotFetch(
    token,
    `/crm/v3/objects/tasks/${taskId}?properties=hs_task_subject,hs_task_body,hs_task_status,hs_timestamp,hs_lastmodifieddate,hs_createdate`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error(`Task fetch failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    hs_task_subject: data.properties?.hs_task_subject,
    hs_task_body: data.properties?.hs_task_body,
    hs_task_status: data.properties?.hs_task_status,
    hs_timestamp: data.properties?.hs_timestamp,
    hs_lastmodifieddate: data.properties?.hs_lastmodifieddate,
    hs_createdate: data.properties?.hs_createdate,
  };
}

function chooseCurrentStage(dealstage: string | undefined) {
  return STAGES.find((stage) => stage.stageId === dealstage);
}

async function ensureStageTask(token: string, deal: DealRecord, stage: StageConfig, taskMap: Map<string, TaskRecord>) {
  if (!stage.createTask) {
    return { created: false };
  }

  const associatedTaskIds = Array.isArray((deal as any).tasks?.results) ? (deal as any).tasks.results : [];
  for (const assoc of associatedTaskIds) {
    const taskId = assoc?.id;
    if (!taskId) continue;
    const task = taskMap.get(taskId) || (await fetchTask(token, taskId));
    taskMap.set(taskId, task);
    if (taskMatchesStage(task, stage)) {
      return { created: false };
    }
  }

  const response = await hubspotFetch(token, '/crm/v3/objects/tasks', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        hs_task_subject: stage.taskSubject,
        hs_task_body: stage.taskBody,
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'TODO',
        hs_task_priority: 'MEDIUM',
        hs_timestamp: String(Date.now()),
        ...(deal.hubspot_owner_id ? { hubspot_owner_id: deal.hubspot_owner_id } : {}),
      },
      associations: [
        {
          to: { id: deal.id },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: DEAL_TASK_ASSOCIATION_TYPE_ID,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Task create failed (${response.status}): ${await response.text()}`);
  }

  return { created: true };
}

async function updateDealStage(token: string, dealId: string, dealstage: string, stage: StageConfig) {
  const properties: Record<string, string> = { dealstage };
  if (stage.statusProperty && stage.statusValue) {
    properties[stage.statusProperty] = stage.statusValue;
  }

  const response = await hubspotFetch(token, `/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    throw new Error(`Deal update failed (${response.status}): ${await response.text()}`);
  }
}

async function syncDeal(token: string, deal: DealRecord) {
  if (deal.pipeline !== HUBSPOT_PIPELINE_ID) {
    return { dealId: deal.id, skipped: true, reason: 'wrong-pipeline' };
  }

  const fullDeal = await fetchDealWithTasks(token, deal.id);
  const currentDeal = {
    id: fullDeal.id,
    dealname: fullDeal.properties?.dealname,
    dealstage: fullDeal.properties?.dealstage,
    pipeline: fullDeal.properties?.pipeline,
    hubspot_owner_id: fullDeal.properties?.hubspot_owner_id,
    tasks: fullDeal.associations?.tasks,
  } as DealRecord & { tasks?: { results?: Array<{ id: string }> } };

  const taskMap = new Map<string, TaskRecord>();
  const updates: string[] = [];

  let currentStage = chooseCurrentStage(currentDeal.dealstage);
  while (currentStage) {
    const associatedTaskIds = currentDeal.tasks?.results || [];
    const matchingTasks: TaskRecord[] = [];

    for (const assoc of associatedTaskIds) {
      const taskId = assoc?.id;
      if (!taskId) continue;
      const task = taskMap.get(taskId) || (await fetchTask(token, taskId));
      taskMap.set(taskId, task);
      if (taskMatchesStage(task, currentStage)) {
        matchingTasks.push(task);
      }
    }

    const completedMatchingTask = matchingTasks.find((task) => isCompletedTask(task));

    if (completedMatchingTask && currentStage.nextStageId) {
      const nextStageId = currentStage.nextStageId;
      const nextStage = STAGES.find((stage) => stage.stageId === nextStageId) || currentStage;
      await updateDealStage(token, currentDeal.id, nextStageId, nextStage);
      updates.push(`${currentStage.stageId}->${nextStageId}`);
      currentDeal.dealstage = nextStageId;
      currentStage = chooseCurrentStage(nextStageId);
      continue;
    }

    await ensureStageTask(token, currentDeal, currentStage, taskMap);
    break;
  }

  if (!currentStage) {
    return { dealId: currentDeal.id, skipped: false, updates };
  }

  const terminalStage = currentStage?.stageId === '1404977728' || currentStage?.stageId === '1404977729';
  if (terminalStage) {
    return { dealId: currentDeal.id, skipped: false, updates };
  }

  return { dealId: currentDeal.id, skipped: false, updates };
}

export default async function handler(req: Request) {
  const token = getToken();
  if (!token) {
    return httpJson(500, { error: 'HUBSPOT_PRIVATE_APP_TOKEN not set' });
  }

  try {
    const deals = await fetchAllOpenOnboardingDeals(token);
    const results = [];

    for (const deal of deals) {
      try {
        results.push(await syncDeal(token, deal));
      } catch (error) {
        results.push({
          dealId: deal.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return httpJson(200, {
      processed: deals.length,
      results,
    });
  } catch (error) {
    return httpJson(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const config = {
  schedule: '* * * * *',
};
