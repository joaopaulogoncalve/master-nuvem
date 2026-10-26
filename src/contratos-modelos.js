// Modelos prontos de contrato. São um ponto de partida: o profissional edita e deve revisar com o advogado dele.
// Campos entre {{chaves}} são preenchidos sozinhos com os dados do cliente, do estúdio e do serviço (CAMPOS abaixo).
// Formatação simples: "## " = título, "**texto**" = negrito, "- " = item de lista.

export const CAMPOS = [
  // [chave, rótulo no formulário, exemplo]
  ["cliente_nome", "Nome do cliente", "Maria da Silva"],
  ["cliente_email", "E-mail do cliente", "maria@email.com"],
  ["estudio_nome", "Seu nome ou do estúdio", "Estúdio Aurora"],
  ["estudio_documento", "Seu CPF ou CNPJ", "12.345.678/0001-90"],
  ["estudio_cidade", "Sua cidade", "Goiânia - GO"],
  ["tipo_evento", "Tipo de evento/serviço", "Casamento"],
  ["data_evento", "Data", "20/12/2026"],
  ["horario", "Horário / duração", "das 16h às 23h"],
  ["local_evento", "Local", "Salão Jardim, Goiânia"],
  ["qtd_fotos", "Fotos editadas incluídas", "300"],
  ["preco_foto_extra", "Preço de cada foto a mais", "R$ 15,00"],
  ["valor_total", "Valor total", "R$ 3.500,00"],
  ["sinal", "Sinal (entrada)", "R$ 1.000,00"],
  ["forma_pagamento", "Forma de pagamento", "PIX: sinal na assinatura e o restante até 7 dias antes do evento"],
  ["prazo_entrega", "Prazo de entrega (dias)", "30"],
  ["dias_galeria", "Dias da galeria online", "60"],
  ["cidade_foro", "Cidade do foro", "Goiânia - GO"]
];

const PARTES = `## Partes

**CONTRATADO(A):** {{estudio_nome}}, CPF/CNPJ {{estudio_documento}}, com sede em {{estudio_cidade}}.

**CONTRATANTE:** {{cliente_nome}}, e-mail {{cliente_email}}, CPF informado na assinatura eletrônica deste contrato.`;

const FINAL = `## Direitos autorais e uso de imagem

As fotos e vídeos são obra do(a) CONTRATADO(A), que mantém os direitos autorais (Lei 9.610/1998). O(A) CONTRATANTE pode usar o material para fins pessoais, inclusive em redes sociais, citando o(a) CONTRATADO(A) sempre que possível. Uso comercial ou publicitário depende de autorização por escrito.

O(A) CONTRATANTE [ ] autoriza [ ] não autoriza o uso de algumas imagens no portfólio e nas redes do(a) CONTRATADO(A) (art. 20 do Código Civil). Na falta de marcação, considera-se não autorizado.

## Cancelamento e direito de arrependimento

O(A) CONTRATANTE pode desistir em até 7 (sete) dias após a assinatura, com devolução integral dos valores pagos (art. 49 do Código de Defesa do Consumidor). Depois desse prazo, o sinal não é devolvido, pois garante a reserva da data. Remarcação depende da disponibilidade de agenda.

## Caso fortuito e força maior

Se o serviço não puder ser prestado por doença grave, acidente ou outro motivo de força maior comprovado, o(a) CONTRATADO(A) indicará profissional de mesma qualidade ou devolverá os valores pagos, sem outras indenizações.

## Assinatura eletrônica

As partes concordam que este contrato seja assinado por meio eletrônico, com confirmação por código enviado ao e-mail do(a) CONTRATANTE, e reconhecem essa assinatura como válida e verdadeira, nos termos do art. 10, § 2º, da Medida Provisória 2.200-2/2001. O registro da assinatura (data, hora, IP e código de verificação do documento) faz parte deste contrato.

## Foro

Fica eleito o foro de {{cidade_foro}} para resolver qualquer questão deste contrato, sem prejuízo do direito do consumidor de propor ação no foro do seu domicílio.`;

export const MODELOS = [
  {
    id: "evento-social",
    nome: "Fotografia de casamento, 15 anos ou festa",
    texto: `# Contrato de prestação de serviços fotográficos

${PARTES}

## Objeto

Cobertura fotográfica do evento **{{tipo_evento}}**, no dia **{{data_evento}}**, {{horario}}, no local **{{local_evento}}**.

## Entrega

- Estão incluídas **{{qtd_fotos}} fotos editadas**, escolhidas pelo(a) CONTRATANTE numa galeria online.
- Fotos além das incluídas custam **{{preco_foto_extra}} cada**, pagas antes da entrega.
- Prazo de entrega: até **{{prazo_entrega}} dias** após o evento, pela galeria online, que fica disponível por **{{dias_galeria}} dias**. Depois desse prazo, o(a) CONTRATANTE deve guardar uma cópia das fotos.
- Fotos não escolhidas ou não editadas não são entregues.

## Valor e pagamento

Valor total: **{{valor_total}}**, sendo **{{sinal}}** de sinal para reservar a data.
Forma de pagamento: {{forma_pagamento}}.
Atraso no pagamento gera multa de 2% e juros de 1% ao mês, e o material só é entregue após a quitação.

## Obrigações do(a) CONTRATANTE

Informar com antecedência o roteiro do evento, garantir acesso do(a) fotógrafo(a) aos locais e, em eventos com mais de 6 horas, oferecer alimentação.

${FINAL}`
  },
  {
    id: "ensaio",
    nome: "Ensaio fotográfico",
    texto: `# Contrato de ensaio fotográfico

${PARTES}

## Objeto

Ensaio fotográfico **{{tipo_evento}}**, no dia **{{data_evento}}**, {{horario}}, no local **{{local_evento}}**.

## Entrega

- Estão incluídas **{{qtd_fotos}} fotos editadas**, escolhidas pelo(a) CONTRATANTE numa galeria online.
- Cada foto a mais custa **{{preco_foto_extra}}**.
- Prazo de entrega: até **{{prazo_entrega}} dias** após a escolha das fotos. A galeria fica disponível por **{{dias_galeria}} dias**.

## Valor e pagamento

Valor total: **{{valor_total}}**, com sinal de **{{sinal}}** na assinatura.
Forma de pagamento: {{forma_pagamento}}.

## Remarcação por clima

Em ensaio externo, chuva forte permite remarcar uma vez, sem custo, em data combinada entre as partes.

${FINAL}`
  },
  {
    id: "video",
    nome: "Filmagem / vídeo",
    texto: `# Contrato de prestação de serviços de filmagem

${PARTES}

## Objeto

Filmagem do evento **{{tipo_evento}}**, no dia **{{data_evento}}**, {{horario}}, no local **{{local_evento}}**.

## Entrega

- Entrega do vídeo editado em até **{{prazo_entrega}} dias** após o evento, por link de download disponível por **{{dias_galeria}} dias**.
- Pedidos de alteração: 1 (uma) rodada de ajustes incluída. Ajustes extras ou cópias adicionais são cobrados à parte (referência: **{{preco_foto_extra}}** por item).
- Arquivos brutos (sem edição) não fazem parte da entrega, salvo acordo por escrito.

## Valor e pagamento

Valor total: **{{valor_total}}**, sendo **{{sinal}}** de sinal.
Forma de pagamento: {{forma_pagamento}}.

${FINAL}`
  },
  {
    id: "contador",
    nome: "Serviços contábeis (contador)",
    texto: `# Contrato de prestação de serviços contábeis

## Partes

**CONTRATADO(A):** {{estudio_nome}}, CPF/CNPJ {{estudio_documento}}, com sede em {{estudio_cidade}}.

**CONTRATANTE:** {{cliente_nome}}, e-mail {{cliente_email}}, CPF/CNPJ informado na assinatura eletrônica deste contrato.

## Objeto

Prestação de serviços contábeis: **{{tipo_evento}}**, a partir de **{{data_evento}}**.

## Documentos

O(A) CONTRATANTE envia os documentos do mês (notas, extratos e comprovantes) até o dia 5 do mês seguinte, pela área de arquivos compartilhada. Documentos enviados fora do prazo podem atrasar entregas e obrigações, sem responsabilidade do(a) CONTRATADO(A).

## Honorários

Honorários mensais de **{{valor_total}}**. Serviços fora do escopo (ex.: abertura ou alteração de empresa, declarações extras) são cobrados à parte.
Forma de pagamento: {{forma_pagamento}}.
Atraso gera multa de 2% e juros de 1% ao mês.

## Vigência e rescisão

Prazo indeterminado. Qualquer parte pode encerrar o contrato com aviso de 30 (trinta) dias, devendo o(a) CONTRATADO(A) entregar os documentos e arquivos do(a) CONTRATANTE.

## Sigilo e dados pessoais

O(A) CONTRATADO(A) guarda sigilo sobre as informações do(a) CONTRATANTE e trata os dados pessoais conforme a LGPD (Lei 13.709/2018).

## Assinatura eletrônica

As partes concordam que este contrato seja assinado por meio eletrônico, com confirmação por código enviado ao e-mail do(a) CONTRATANTE, e reconhecem essa assinatura como válida, nos termos do art. 10, § 2º, da Medida Provisória 2.200-2/2001.

## Foro

Fica eleito o foro de {{cidade_foro}}.`
  },
  {
    id: "em-branco",
    nome: "Em branco (escrever do zero)",
    texto: `# Contrato

${PARTES}

## Objeto

(descreva aqui o serviço)

## Valor e pagamento

Valor total: **{{valor_total}}**. Forma de pagamento: {{forma_pagamento}}.

## Assinatura eletrônica

As partes concordam que este contrato seja assinado por meio eletrônico, com confirmação por código enviado ao e-mail do(a) CONTRATANTE, e reconhecem essa assinatura como válida, nos termos do art. 10, § 2º, da Medida Provisória 2.200-2/2001.

## Foro

Fica eleito o foro de {{cidade_foro}}.`
  }
];

// Troca {{campo}} pelos valores; campo sem valor fica visível como "____" para o fotógrafo completar.
export function preencher(texto, valores) {
  return String(texto).replace(/\{\{([a-z_]+)\}\}/g, function (m, chave) {
    const v = valores && valores[chave] !== undefined && valores[chave] !== null ? String(valores[chave]).trim() : "";
    return v || "____";
  });
}
