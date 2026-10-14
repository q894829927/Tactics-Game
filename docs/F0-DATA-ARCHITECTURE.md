# F0：角色、职业与七系武器数据结构（v0.1.21.0）

> 状态：数据层基础已接入；**职业切换、武器熟练度校验、特效与战技未开放**。本阶段保证现有10×8关卡4v6战斗结果、操作与基础数值不变。

## 模块职责

| 模块 | 权威数据 | F0实际行为 |
|---|---|---|
| `src/engine/equipmentTypes.ts` | WeaponCategory七系、WeaponRank E–S+、Weapon类型 | 统一类型与基础元数据 |
| `src/engine/weapons.ts` | 当前16件武器的定义、分类、最低技能等级标签 | `weaponFor`返回独立副本；`canWield`按当前职业允许的类别校验 |
| `src/engine/characters.ts` | 稳定CharacterId、人物个人档案、独立个人属性/成长率、初始职业与装备 | 新建角色时生成独立的可变属性副本，初始装备不再由职业决定 |
| `src/engine/classes.ts` | ClassId、职业名字、头像图标、允许的武器类别、预留职业成长/技能字段 | 仅类别装备权限及UI名称生效；初始职业修正为零 |
| `src/engine/attributes.ts` | 角色个人成长数据结构、战斗数值公式、升级计算 | 个人状态不再内含武器；战斗计算显式额外提供当前武器 |
| `src/engine/battle.ts` | 行动、装备操作、移动、战斗结算 | `unit.characterId`绑定人物；`unit.classId`决定可用武器类别 |
| `src/main.ts` / `src/scene/BoardView.ts` | 视觉展示 | 名称/徽记从当前职业定义读取，现有文本和图标不改变 |

## 兼容性和权限边界

- `Unit.id` 保留原来的 `a1…a4/e1…e6`；`characterId`为对应稳定人物ID；`classId`是职业唯一权威字段。
- `Unit.role` 暂时作为历史代码/测试兼容镜像，**不得再用于决定可装备武器或UI职业名称**；在未来C1开放换职API时由规范化迁移逻辑处理其淘汰。F0不提供用户可操作的转职入口。
- `CHARACTER_LIBRARY`控制初始装备和人物基本能力；`PERSONAL_PROFILES`为个人成长基础模板。两个不同角色可以共享初始档案模板，但创建的`stats`和`growths`必须互不引用。
- `CLASS_LIBRARY`目前包含6个已有职业的显示/类别规则，另有 `brawler` 和 `acolyte` 两个**仅静态数据的未开放模板**，以验证未来拳套和白魔法分类可用。它们不加入首关、不进入角色职业选择界面，也没有技能效果。
- `WEAPON_CATEGORIES`固定为`sword, lance, axe, bow, gauntlet, dark, white`。旧三系法术都暂标为`dark`（进攻魔法）；**没有加入治疗法术、拳套装备或武器三角**。
- `Weapon.kind`保留`physical/magical`兼容现有伤害公式；`Weapon.category`承担七系类别身份。这两个字段语义不同，不能以职业或造成的伤害类型反推类别。
- `Weapon.requiredRank`与`ClassDefinition.requiredWeaponRanks`已作为数据准备，**F0尚不强制熟练度门槛**。现有初始装备中的钢剑、钢枪、长弓等仍可像原来一样使用；P1落实熟练经验并统一处理初始武器/等级匹配。
- 职业`statModifiers/growthModifiers/innateAbilityIds/masteryRewardIds`目前零加成/空列表，不自动实现未来职业的属性和技能；C1/S1负责真实应用与结算。
- 尚无具体`WeaponInstance`耐久与独立法术次数。W2引入装备实例时必须保留相同武器的多份库存与独立耐久数据，不能直接给`WeaponDefinition`添加玩家可变的耐久字段。

## 数据流

`CHARACTER_LIBRARY[characterId]` → `PERSONAL_PROFILES[profileId]` → 新鲜`CharacterData`（个人属性/成长，不含装备） → `Unit`（classId+inventory+weapon） → `canWield(unit.classId, id)` → `CLASS_LIBRARY[classId].weaponCategories` → `WEAPON_LIBRARY[id].category`。

战斗预测、伤害、反击、追击W0门槛≥4、移动撤销和AI规则保持原有语义。

## F0验收清单

1. 10个角色初始位置、个人基础值、HP、移动、成长率、职业、名字和原始3件装备不变。
2. 当前16件武器的威力、命中、重量、射程、必杀等原始数值不变，新增类别和需求等级元数据。
3. 双方角色即便使用同一人物属性模板，修改其中一个的属性/成长/装备也不影响另一个或静态定义。
4. 把`role`兼容字段保持为旧职业、只改变`classId`，装备权限须遵循`classId`，而不是旧`role`。
5. 现有战斗、命中、追击、预测、敌军回合、攻击菜单、手机/桌面操作均保持可用。
6. 通过`npm run verify`、浏览器多分辨率验收和静态发布；ECS部署要单独核对。

**后续阶段：** W1武器固有特效与目标标签；W2物理武器耐久和魔法资源；P1熟练度和装备等级校验；C1自由职业转换与实际职业数值补正。
