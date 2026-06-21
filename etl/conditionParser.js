/**
 * conditionParser.js
 *
 * Parser untuk formula kondisi aktivasi skill di Uma Musume (master.mdb).
 *
 * Format formula (confirmed dari analisa data):
 *   "term1&term2&term3@term1&term2&term3"
 *
 *   - '&'  = AND (semua term dalam grup harus terpenuhi)
 *   - '@'  = OR  (memisahkan beberapa grup alternatif; cukup salah satu
 *                 grup terpenuhi)
 *   - tiap term berbentuk: <variable><operator><value>
 *     operator yang valid: ==, >=, <=, !=, >, <
 *     value: integer (boleh negatif, mis. "-1")
 *
 * Contoh:
 *   "order>=3&order_rate<=50&remain_distance<=200&bashin_diff_infront<=1
 *      @order>=3&order_rate<=50&remain_distance<=200&bashin_diff_behind<=1"
 *   -> 2 clause (OR), masing-masing 4 term (AND)
 *
 * Catatan: skill_data.condition_1 dan condition_2 adalah DUA formula
 * TERPISAH (bukan bagian dari satu formula besar). Tiap skill_data row
 * punya field condition_1 DAN condition_2, yang masing-masing berlaku
 * untuk efek skill yang berbeda (lihat ability_type_1_* vs ability_type_2_*
 * di skema asli). Parser ini dipanggil terpisah untuk tiap field.
 */

'use strict';

// Operator harus dicek dari yang PALING PANJANG dulu (>=, <=, ==, !=)
// supaya tidak salah parse jadi '>' atau '=' duluan.
const OPERATOR_REGEX = />=|<=|==|!=|>|</;

// Regex satu term lengkap: nama_variabel + operator + angka (boleh negatif)
const TERM_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)(>=|<=|==|!=|>|<)(-?\d+)$/;

/**
 * Parse satu formula condition_1 atau condition_2 dari skill_data.
 *
 * @param {string|null} formula - raw string dari kolom condition_1/condition_2
 * @returns {Array<Array<{variable: string, operator: string, value: number, raw: string}>>}
 *          Array of OR-clauses; tiap clause adalah array of AND-terms.
 *          Formula kosong/null -> [] (tidak ada kondisi, dianggap selalu true
 *          oleh caller jika diperlukan).
 */
function parseCondition(formula) {
  if (!formula || formula.trim() === '') {
    return [];
  }

  const orClauses = formula.split('@');
  const result = [];

  for (const clauseStr of orClauses) {
    const terms = clauseStr.split('&').filter((t) => t.length > 0);
    const parsedTerms = [];

    for (const termStr of terms) {
      const match = termStr.match(TERM_REGEX);
      if (!match) {
        // Term tidak dikenali formatnya -- jangan diam-diam diabaikan,
        // supaya kita tahu kalau ada pola formula baru yang belum di-handle.
        throw new ConditionParseError(
          `Term tidak bisa di-parse: "${termStr}" (dari formula: "${formula}")`
        );
      }
      const [, variable, operator, valueStr] = match;
      parsedTerms.push({
        variable,
        operator,
        value: parseInt(valueStr, 10),
        raw: termStr,
      });
    }

    result.push(parsedTerms);
  }

  return result;
}

class ConditionParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConditionParseError';
  }
}

/**
 * Evaluasi satu term terhadap nilai aktual dari race context.
 * @param {{variable: string, operator: string, value: number}} term
 * @param {number} actualValue
 * @returns {boolean}
 */
function evaluateTerm(term, actualValue) {
  switch (term.operator) {
    case '==':
      return actualValue === term.value;
    case '!=':
      return actualValue !== term.value;
    case '>=':
      return actualValue >= term.value;
    case '<=':
      return actualValue <= term.value;
    case '>':
      return actualValue > term.value;
    case '<':
      return actualValue < term.value;
    default:
      throw new Error(`Operator tidak dikenal: ${term.operator}`);
  }
}

/**
 * Evaluasi keseluruhan parsed condition (hasil dari parseCondition) terhadap
 * sebuah "context" object berisi nilai-nilai variabel race saat ini.
 * Term dengan variable yang TIDAK ADA di context akan dianggap "unknown"
 * dan TIDAK membatalkan clause -- berguna untuk Tahap 1 (filter statis)
 * di mana kita cuma punya sebagian variabel (track_id, course_distance, dst)
 * dan belum simulasi penuh (distance_rate, order_rate, dst).
 *
 * @param {Array<Array<object>>} parsedClauses - hasil parseCondition()
 * @param {Object<string, number>} context - mis. { track_id: 10006, course_distance: 2400 }
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] - kalau true, variable yang tidak
 *        ada di context dianggap GAGAL (bukan diabaikan). Pakai strict=true
 *        untuk Tahap 2 (simulasi penuh) setelah semua variabel runtime tersedia.
 * @returns {boolean}
 */
function evaluateCondition(parsedClauses, context, options = {}) {
  const { strict = false } = options;

  if (parsedClauses.length === 0) {
    return true; // tidak ada kondisi = selalu valid
  }

  // OR antar clause: cukup salah satu clause yang semua term-nya valid
  return parsedClauses.some((clause) =>
    clause.every((term) => {
      if (!(term.variable in context)) {
        return !strict; // unknown var: lolos kalau non-strict, gagal kalau strict
      }
      return evaluateTerm(term, context[term.variable]);
    })
  );
}

/**
 * Helper: ambil semua nama variabel unik yang dipakai dalam sebuah
 * parsed condition. Berguna untuk tahu data apa saja yang dibutuhkan
 * sebelum bisa evaluasi clause itu secara strict.
 */
function getVariablesUsed(parsedClauses) {
  const vars = new Set();
  for (const clause of parsedClauses) {
    for (const term of clause) {
      vars.add(term.variable);
    }
  }
  return [...vars];
}

module.exports = {
  parseCondition,
  evaluateTerm,
  evaluateCondition,
  getVariablesUsed,
  ConditionParseError,
};
