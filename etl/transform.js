/**
 * transform.js
 * Ubah data skill mentah (dari extract.js) menjadi baris-baris
 * skill_condition_clauses, menggunakan conditionParser.
 *
 * Setiap term hasil parse menjadi satu baris di tabel
 * skill_condition_clauses, siap di-insert ke MySQL.
 */

'use strict';

const { parseCondition, ConditionParseError } = require('./conditionParser');

/**
 * @param {Array<object>} skills - hasil dari extract.js extractSkills()
 * @returns {{
 *   clauseRows: Array<object>,
 *   parseErrors: Array<{skillId: number, field: string, formula: string, error: string}>
 * }}
 */
function transformSkillConditions(skills) {
  const clauseRows = [];
  const parseErrors = [];

  for (const skill of skills) {
    processField(skill.id, 1, skill.condition_1, clauseRows, parseErrors);
    processField(skill.id, 2, skill.condition_2, clauseRows, parseErrors);
  }

  return { clauseRows, parseErrors };
}

function processField(skillId, groupIndex, formula, clauseRows, parseErrors) {
  if (!formula || formula.trim() === '') {
    return;
  }

  let parsedClauses;
  try {
    parsedClauses = parseCondition(formula);
  } catch (err) {
    if (err instanceof ConditionParseError) {
      parseErrors.push({
        skillId,
        field: `condition_${groupIndex}`,
        formula,
        error: err.message,
      });
      return; // skip skill ini, jangan hentikan seluruh pipeline
    }
    throw err;
  }

  parsedClauses.forEach((clause, clauseIndex) => {
    clause.forEach((term) => {
      clauseRows.push({
        skill_id: skillId,
        group_index: groupIndex,
        clause_index: clauseIndex + 1, // 1-based, lebih natural buat dibaca
        variable_name: term.variable,
        operator: term.operator,
        value: term.value,
        raw_term: term.raw,
      });
    });
  });
}

module.exports = { transformSkillConditions };
