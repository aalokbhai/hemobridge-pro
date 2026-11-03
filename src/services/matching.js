const { pool } = require('../config/db');
const { donorGroupsFor } = require('../utils/helpers');

// Compatible blood group wale donors jinki city request ke city/hospital text me aati ho
async function countMatches(bloodGroup, cityText) {
  const groups = donorGroupsFor(bloodGroup);
  const [[{ n }]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM donors
     WHERE blood_group IN (${groups.map(() => '?').join(',')}) AND city <> '' AND LOCATE(LOWER(city), ?) > 0`,
    [...groups, String(cityText).toLowerCase()]
  );
  return n;
}

module.exports = { countMatches };
