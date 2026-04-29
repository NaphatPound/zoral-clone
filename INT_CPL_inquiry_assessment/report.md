# Query Review Report — INT_CPL_inquiry_assessment

**Source :** `INT_CPL_inquiry_assessment_0.xml`
**Purpose :** หา column ที่ `SELECT` มาแต่ไม่ได้ใช้ใน flow และ query ที่ดึงข้อมูลหนักเกินจำเป็น เพื่อแก้ปัญหา **memory เต็ม**
**Date :** 2026-04-22

---

## 1. Summary

| หมวด | จำนวน | รายละเอียด |
|------|------|----------|
| ComponentTask (AdwQuery) | 7 | 22 sub-queries ข้าม 15 ตาราง |
| Sub-query ที่ **มี column ไม่ได้ใช้ใน flow** | 11 / 22 | ดู §2 |
| Sub-query ที่ **เป็น performance risk** | 6 / 22 | ดู §3 |
| **Heavy memory hotspot** | 3 | Item #6 (5 tables), #10 summarySection, #19 listsNullType/listsOtherType |

**TL;DR :**
- มี column ที่ *"passthrough-only"* (ไม่มี script อ่าน) แต่ถูก bundle ลง final response ~40 columns
- มี 1 query ใช้ `NOT LIKE '%CAP%'` (anti-pattern) — #19 `listsOtherType`
- มี 2 query ที่ใช้แค่ `.length > 0` แต่ดึงทุกแถว — #19 `listsNullType`, `listsOtherType`
- ไม่มี query ตัวไหน SELECT ALL COLUMNS (`*`) — ทุกตัวระบุ column แล้ว ถือว่าดี

---

## 2. Per-query Column Usage (ไม่ใช้ใน flow)

> "ไม่ใช้ใน flow" = ไม่มี ScriptTask/Gateway อ่าน field นี้จาก `steps.*.data.*`
> หมายเหตุ : field เหล่านี้ **ยังถูกส่งกลับใน response** ให้ caller — ถ้าเอาออกต้องเช็คกับ consumer ก่อน

### 2.1 `mas_corp_assessment_mapping` (Item #3, line 77–99)

**SELECT 19 columns**

| Column | ใช้ใน flow? | Action |
|--------|-----|--------|
| `customer_type` | ❌ (อยู่ใน WHERE แล้ว) | **ลบออก** ปลอดภัย |
| `mapping_id` | ❌ | ตรวจสอบ caller → อาจลบ |
| `level_type` | ❌ | ตรวจสอบ caller → อาจลบ |
| `analysis_type` | ❌ | ตรวจสอบ caller → อาจลบ |
| `document_code` | ❌ | ตรวจสอบ caller → อาจลบ |
| account_group, account_type, csr_weight, crr_weight, customer_status, form_group, formula_code, isic_group, occupation_agricultural, prefix_debt, summary_crr_code, summary_csr_code, total_debt, assessment_type | ✅ | keep |

ลบได้อาจลดขนาด row ลง ~25%

### 2.2 `mas_corp_assessment_form` (Item #4, line 142–153)

**SELECT 10 columns**

| Column | ใช้ใน flow? | Action |
|--------|-----|--------|
| `form_desc` | ❌ | ตรวจ caller → อาจลบ |
| `form_group_desc` | ❌ | ตรวจ caller → อาจลบ |
| `form_id` | ❌ | ตรวจ caller → อาจลบ |
| `form_title` | ❌ | ตรวจ caller → อาจลบ |
| `pass_score` | ❌ | ตรวจ caller → อาจลบ |
| `score` | ❌ | ตรวจ caller → อาจลบ |
| form_code, form_group, is_form_base, property | ✅ | keep |

6/10 columns ไม่ได้ใช้ใน flow — เป็น *passthrough* อย่างเดียว

### 2.3 `mas_corp_assessment_summary` (Item #4)

**SELECT 4 columns** — **ไม่มี column ไหนถูกอ่านใน flow** (passthrough ทั้งหมด)
```
summary_code, summary_desc, summary_id, property
```
Action : ทั้งหมดเป็น passthrough → ถ้า caller ไม่ใช้บางตัว ลบได้

### 2.4 `mas_corp_assessment_csr_formula` (Item #4)

**SELECT 6 columns**

| Column | ใช้ใน flow? | Action |
|--------|-----|--------|
| `formula_code` | ✅ (Item #6 ใช้เป็น input) | keep |
| description, formula_id, pass_score, score, property | ❌ | ตรวจ caller → อาจลบ |

5/6 ไม่ใช้ใน flow

### 2.5 `mas_corp_assessment_section` (Item #10, line 750–759)

**SELECT 8 columns**

| Column | ใช้ใน flow? |
|--------|-----|
| form_code, section_code, section_type, section_seq | ✅ |
| `section_id`, `section_desc`, `form_group`, `property` | ❌ (property อาจใช้เฉพาะบาง case ผ่าน merging) |

4/8 passthrough — ลบ `section_id`, `section_desc`, `form_group` ได้ (form_group รู้อยู่แล้วจาก WHERE)

### 2.6 `mas_corp_assessment_summary_section` (Item #10, line 760–772)

**SELECT 11 columns**

ใช้ใน flow : `group_criteria_code` (Item #6 เอาไปเป็น input), `summary_section_code` (Item #9 เอาไปเป็น input)

Passthrough (ไม่ถูก script อ่าน) : `is_sum`, `section_code`, `summary_code`, `summary_section_desc`, `summary_section_id`, `section_type`, `condition`, `is_show`, `sections`

**9/11 ไม่ใช้ใน flow** — ส่วนใหญ่ passthrough

### 2.7 `mas_corp_assessment_topic` (Item #9, line 660–675)

**SELECT 14 columns**

ใช้ใน flow : `form_code`, `section_code`, `topic_code`, `topic_seq`, `factor_code`, `property` (.refVariable, .condition, .customerType)

Passthrough : `form_group`, `topic_desc`, `topic_group`, `topic_id`, `topic_input_type`, `topic_type`, `uom_text`, `hierarchy`

**8/14 passthrough**

### 2.8 `mas_corp_assessment_summary_topic` (Item #9, line 676–688)

**SELECT 11 columns** — **ทั้งหมดเป็น passthrough** (ไม่มี script อ่าน)
```
property, summary_section_code, summary_topic_code, summary_topic_desc,
summary_topic_id, summary_topic_seq, summary_topic_input_type,
summary_topic_type, topic_group, uom_text, name
```
Action : ถ้า caller ไม่ได้ใช้ summary_topic ละเอียด ลบ column ที่ไม่ต้องการได้

### 2.9 `mas_corp_assessment_option` (Item #6, line 435–466)

**SELECT 14 columns × 2 variants** (option + optionSectionScore)

ใช้ใน flow : `form_code`, `topic_code`, `section_code`, `option_group`, `section_calculate_code`

Passthrough : `form_group`, `max_range`, `min_range`, `option_desc`, `option_id`, `option_input_type`, `option_seq`, `score`, `property`

**ที่สำคัญ** : ตาราง option มีแนวโน้มใหญ่ที่สุด → column ที่ไม่ใช้ × row จำนวนมาก × 2 query ← **hotspot**

### 2.10 `mas_corp_assessment_variable` (Item #13)

**SELECT 6 columns**

ใช้ใน flow : `variable_code`, `integrate_code`

Passthrough : `condition_code`, `property`, `variable_id`, `variable_name`

### 2.11 `master_backend_parameter` (Item #22)

**SELECT 10 columns**

ใช้ใน flow : `key_name`, `key_json_value`

Passthrough : `create_by`, `create_date`, `key_group`, `key_id`, `key_value`, `remark`, `update_by`, `update_date`

**8/10 ไม่ใช้** — ลบ audit fields และ metadata ได้ทั้งหมด

### 2.12 `master_mas_agricultural_p` (Item #16)

**SELECT 3 columns**

ใช้ใน flow : `occupation_agricultural`, `formula_name`

Passthrough : `formula_type`

---

## 3. Performance / Memory Risks

### 🔴 HIGH : `NOT LIKE '%CAP%'` anti-pattern
**Location :** Item #19 `AdwQueryProductMaxtrix` (line 1299) — `listsOtherType`

```graphql
listsOtherType: master_mas_product_matrix(
  where: {product_concat: {_eq: $productConcat},
          calculation_tool: {_nlike:"%CAP%"} }
) { product_concat, customer_type }
```

**ปัญหา :**
- `_nlike "%CAP%"` มี leading `%` → **ใช้ index ไม่ได้**, ต้อง full scan column
- ข้อมูล `calculation_tool` ที่มีคำว่า CAP อยู่กลางก็จะไม่ตรง
- ใช้จริงแค่ `.length > 0` เท่านั้น (ใน Item #5 Output line 347)

**แนะนำ :**
```graphql
# ใช้ count aggregate + limit 1
listsOtherType_count: master_mas_product_matrix_aggregate(
  where: {product_concat: {_eq: $productConcat},
          calculation_tool: {_nin: ["CAP", "CAP_INVESTMENT"]}}  # ถ้ารู้ค่า CAP ที่แน่ๆ
) { aggregate { count } }
```
หรือ
```graphql
listsOtherType: master_mas_product_matrix(
  where: {...}, limit: 1
) { product_concat }  # SELECT แค่ 1 column
```

---

### 🔴 HIGH : `listsNullType` / `listsOtherType` ดึง row ทั้งหมดแต่ใช้แค่ `.length`
**Location :** Item #19 (line 1295–1302) + Item #5 usage (line 347)

**ปัญหา :**
```js
steps.AdwQueryProductMaxtrix?.data?.listsNullType?.length > 0
steps.AdwQueryProductMaxtrix?.data?.listsOtherType?.length > 0
```
ใช้แค่ "มี data ไหม" → แต่ดึงทุก row + 2 column

**แนะนำ :** เปลี่ยนเป็น `_aggregate` + `count` หรือ `limit: 1` + SELECT แค่ primary key

---

### 🟠 MEDIUM : Item #6 AdwQueryOptionAndSummaryCriteria ยิง 5 query ในหนึ่ง call
**Location :** Item #6 (line 434–516)

**ปัญหา :**
- 5 tables × large row count × 14 columns = memory hotspot
- `option` query **ซ้ำ 2 variants** ด้วย WHERE ต่างกัน → fetch 2 รอบ
- `factorCRR` ดึงด้วย `factor_code IN $factor_code` **แล้วค่อย filter อีกใน Item #5** (line 314–316) = over-fetch

**แนะนำ :**
1. แยก Item #6 เป็น 2–3 ComponentTask — ลด peak memory
2. ใน `option` query ลบ passthrough columns เช่น `option_desc` (ถ้า caller ไม่ใช้ข้อความ), `property` (ถ้า property ใหญ่)
3. สำหรับ `factorCRR` — ถ้าตอน query รู้ topicList ที่ final แล้ว ส่ง factor_code ที่ narrow ลง

---

### 🟠 MEDIUM : `form` query ดึงทุก form ใน form_group แล้วค่อย filter
**Location :** Item #4 (line 142), Item #5 (line 223–258)

**ปัญหา :**
- Query : `WHERE form_group = $form_group` → คืน **ทุก form** ของ group นั้น
- ใน Item #5 มีการกรองด้วย `selectForm` และ `is_form_base` แล้วค่อย merge
- ถ้า form_group มีหลาย form (เช่น multi-form) จะดึงมาเยอะแล้วทิ้งส่วนใหญ่

**แนะนำ :**
- ถ้า `globalVariables.selectForm` มีค่าแล้ว (รู้ตั้งแต่ Item #8) → re-query เฉพาะ `form_code IN (selectForm, baseFormCode)` แทน
- แต่ flow ตอนนี้ query form ก่อน #8 → ต้อง refactor ลำดับ (ย้าย #8 ก่อน #4) หรือเพิ่ม query #4b ที่แคบกว่า

---

### 🟡 LOW : `topic`, `option`, `optionSectionScore` — cartesian potential
**Location :** Item #9, Item #6

**ปัญหา :**
- WHERE ใช้ `form_code IN [...] AND section_code IN [...]` — ถ้า list ใหญ่ ผลลัพธ์ cartesian
- ถ้า form มี 10 form, section มี 50 section → 500 combinations × topics ต่ออัน

**แนะนำ :**
- ถ้าจำนวน form_code narrow ได้หลังจาก #8 (multi-form resolution) → ย้าย #9, #6 มาหลัง #8 (flow ปัจจุบันทำอยู่แล้ว แต่ FormList ใน #9, #6 ยัง include `is_form_base` **เสริม** selectForm เสมอ → ตรวจสอบว่าจำเป็นไหม)
- ใช้ `limit` + pagination ถ้า option list คาดว่าเกิน N แถว

---

### 🟡 LOW : `property` JSON blob ใน 8 ตารางถูกดึงมาเต็ม
**Location :** form, summary, csr_formula, section, summary_section, summary_topic, topic, option, variable, factorCSR

**ปัญหา :**
- GraphQL ไม่ project เข้า JSON keys → ดึงทั้ง blob
- script อ่านเฉพาะ `property.refVariable`, `property.condition`, `property.conditionRender`, `property.businessType`, `property.customerCode`, `property.groupType`, `property.accountType`, `property.isMultiForm`

**แนะนำ :**
- ถ้า DB รองรับ JSON projection (Postgres `jsonb_build_object`) → เปลี่ยน schema ให้มี view ที่ project เฉพาะ keys ที่ใช้
- ถ้าไม่ได้ → ลบ `property` ออกจาก SELECT ของตารางที่ script ไม่เคยอ่าน property (เช่น `mas_corp_assessment_summary`, `mas_corp_assessment_summary_topic`)

---

## 4. Recommended Patches (เรียงตาม impact/complexity)

### Patch 1 (quick win, low risk) — ลบ column passthrough ที่ caller ไม่ใช้
**Effort :** 1–2 ชั่วโมง
**Impact :** ลด payload ต่อ row ~20–40%
**Pre-req :** ตรวจสอบกับทีม frontend/caller ว่า column ไหนใช้จริง

Target columns (ตรวจทีละตัวกับ caller) :

| Table | Candidate remove |
|-------|------------------|
| mas_corp_assessment_mapping | mapping_id, level_type, analysis_type, document_code, customer_type |
| mas_corp_assessment_form | form_id, form_title, form_group_desc, form_desc |
| mas_corp_assessment_summary | summary_id, summary_desc (ถ้าไม่แสดง) |
| mas_corp_assessment_csr_formula | formula_id, description |
| mas_corp_assessment_section | section_id, section_desc, form_group |
| mas_corp_assessment_summary_section | summary_section_id, summary_section_desc |
| mas_corp_assessment_summary_topic | summary_topic_id, summary_topic_desc |
| mas_corp_assessment_topic | topic_id, topic_desc, topic_group, form_group, uom_text |
| mas_corp_assessment_option | option_id, option_desc, form_group |
| mas_corp_assessment_variable | variable_id, variable_name |
| master_backend_parameter | create_by, create_date, key_id, key_value, remark, update_by, update_date, key_group |
| master_mas_agricultural_p | formula_type |

### Patch 2 (quick win, zero risk) — เปลี่ยน `.length > 0` queries เป็น aggregate
**Effort :** 30 นาที
**Impact :** ลดปริมาณ row ของ 2 query ลงเหลือ 0–1 row
**Change :** Item #19 `listsNullType` + `listsOtherType` → ใช้ `_aggregate` หรือ `limit: 1`

### Patch 3 (medium) — ลบ `NOT LIKE '%CAP%'`
**Effort :** 1 ชั่วโมง + ต้องรู้ domain values
**Impact :** ลด DB CPU, ใช้ index ได้
**Change :** หา enum/list ของค่า `calculation_tool` ที่ถือว่าเป็น CAP → ใช้ `_nin`

### Patch 4 (medium) — ลบ `property` blob จากตารางที่ไม่ใช้ property
**Effort :** 2 ชั่วโมง + regression test
**Impact :** ลด memory มาก ถ้า property JSON ใหญ่

Tables ที่ script **ไม่เคยอ่าน** `.property` :
- `mas_corp_assessment_summary` ← property ลบได้เลย (ถ้า caller ไม่ใช้)
- `mas_corp_assessment_summary_topic`
- `mas_corp_assessment_summary_section`
- `mas_corp_assessment_csr_formula`
- `mas_corp_assessment_option` (script ใช้ option ด้าน mapping แต่ไม่อ่าน property)
- `mas_corp_assessment_variable`
- `mas_corp_assessment_csr_factor`

Tables ที่ script **อ่าน** `.property` → keep :
- `mas_corp_assessment_form` (property.businessType, customerCode, groupType, accountType, isMultiForm, conditionRender)
- `mas_corp_assessment_topic` (property.refVariable, condition, customerType)
- `mas_corp_assessment_section` (property? — ตรวจ grep ไม่เจอ → อาจลบได้)

### Patch 5 (large) — แยก Item #6 (5 sub-queries) เป็น 2–3 steps
**Effort :** ครึ่งวัน + test flow
**Impact :** ลด peak memory ที่ทำให้ OOM
**Change :** แยก option/optionSectionScore ออกจาก factor/criteria เป็น ComponentTask อีกตัว

### Patch 6 (design) — ย้ายลำดับ #4 ไปหลัง #8 หรือเพิ่ม #4-narrow หลัง #8
**Effort :** 1 วัน + refactor flow + regression
**Impact :** ลด form overfetch
**Change :** ตัดสินใจ `selectForm` ก่อน query form/section/topic รายตัว

### Patch 7 (long-term) — Pagination / chunked fetching
**Effort :** 2–3 วัน
**Impact :** จัดการกรณี row เยอะมาก
**Change :** แบ่ง query เป็น batches ด้วย `limit` + `offset` หรือ cursor

---

## 5. Monitoring suggestions

1. **เก็บ row count ต่อ query** ในแต่ละ ComponentTask (Zoral มี `EnableMetricsCollection` — เปิดใช้)
2. **ดู payload size** ต่อ response จาก backend ADW → หา 80th/95th percentile
3. **วัด peak memory** ระหว่าง Item #5 (Output) เพราะเป็นจุดที่รวมทุกอย่าง
4. Alert ถ้า `option[].length > N`, `topic[].length > N` — จะช่วยชี้ว่า caller ส่ง `form_code` กว้างเกินไป

---

## 6. Validation ก่อนลบ column

ก่อน apply Patch 1 ให้ทำตามนี้:

1. `grep -r "<column_name>" <caller-frontend-source>` เพื่อดูการใช้
2. เปิด metrics Zoral ดู response ของ workflow ที่ผ่านมา → ตรวจว่า caller ใช้ผ่าน field ไหน
3. Stage กับ `feature flag` ก่อน → ลบทีละ table แล้วค่อย roll out
4. ถ้าไม่แน่ใจ — เก็บ column ไว้แต่ใช้ approach ของ Patch 4 (ลบ `property` blob เฉพาะที่ script ไม่ใช้)

---

## 7. Quick wins สรุป (ทำได้ทันที memory-เต็มคาดว่าบรรเทา)

| Priority | Patch | Expected memory reduction |
|----------|-------|---------------------------|
| P0 | Patch 2 (`listsNullType/listsOtherType` → aggregate) | ~5–15% |
| P0 | Patch 4 (ลบ `property` จากตารางที่ไม่ใช้) | **~20–40%** |
| P1 | Patch 1 (ลบ passthrough columns) | ~10–20% |
| P2 | Patch 3 (`NOT LIKE` → `_nin`) | ลด DB CPU เป็นหลัก |
| P3 | Patch 5, 6, 7 | ลด peak memory hotspot |

รวม P0 + P1 (ทำได้ใน 1–2 วัน + regression test) ควรลด payload workflow ลงได้ประมาณ **30–50%**
