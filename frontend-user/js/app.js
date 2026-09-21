/**
 * 投标报价计算器 - 核心逻辑
 */
function bidCalculator() {
    return {
        // 配置参数
        config: {
            mode: 'single',        // 'single' 单低模式 | 'double' 双低模式
            maxPrice: null,        // 上限价（超出则废标）
            minPrice: null,        // 下限价（低于则废标）
            fullScore: 30,         // 价格分满分
            deductUp: 1.0,         // 上浮扣分系数（每高于基准价1%扣多少分）
            deductDown: 0.5,       // 下浮扣分系数（每低于基准价1%扣多少分，设为0表示低于不扣分）
            minScore: 0,           // 最低得分
            lowestWeight: 40,      // 双低模式下最低价权重(%)
        },

        // 投标报价列表
        bids: [],

        // 新增报价表单
        newBid: {
            name: '',
            price: null
        },

        // 报价ID计数器
        bidIdCounter: 0,

        // ========== 方案对比功能 ==========

        // 方案列表
        scenarios: [],

        // 当前选中的方案ID（null 表示当前编辑中的未保存方案）
        currentScenarioId: null,

        // 方案名称输入
        newScenarioName: '',

        // 对比模式开关
        compareMode: false,

        // 用于对比的方案ID列表
        compareScenarioIds: [],

        // 方案ID计数器
        scenarioIdCounter: 0,

        // ========== 多选合并导出 ==========

        // 导出选择模式
        exportSelectMode: false,

        // 勾选待合并导出的方案ID
        selectedExportIds: [],

        // ========== 导入冲突处理 ==========

        importModal: {
            open: false,
            fileName: '',
            exportedAtText: '',
            modeLabels: [],
            incoming: [],          // 已通过校验的待导入方案（内存中，未提交前不落库）
            conflicts: [],         // 同名冲突项
            newCount: 0            // 不冲突、将直接新增的数量
        },

        // ========== 全局提示 ==========

        toast: {
            show: false,
            type: 'success',       // success | error | info
            message: ''
        },
        toastTimer: null,

        // 本地持久化键名
        STORAGE_KEY: 'bid-calculator:scenarios:v1',

        /**
         * Alpine 初始化：从本地恢复已保存方案（保证刷新后导入/保存的数据仍在）
         */
        init() {
            this.restoreScenarios();
        },

        /**
         * 添加报价
         */
        addBid() {
            if (!this.newBid.name || !this.newBid.price || this.newBid.price <= 0) return;

            this.bids.push({
                id: ++this.bidIdCounter,
                name: this.newBid.name.trim(),
                price: parseFloat(this.newBid.price)
            });

            this.newBid = { name: '', price: null };
        },

        /**
         * 删除报价
         */
        removeBid(id) {
            this.bids = this.bids.filter(b => b.id !== id);
        },

        /**
         * 清空所有报价
         */
        clearBids() {
            this.bids = [];
            this.currentScenarioId = null;
        },

        // ========== 方案管理方法 ==========

        /**
         * 保存当前方案
         */
        saveScenario() {
            if (!this.newScenarioName.trim()) return;
            if (this.bids.length === 0) return;

            const scenarioData = {
                id: ++this.scenarioIdCounter,
                name: this.newScenarioName.trim(),
                config: JSON.parse(JSON.stringify(this.config)),
                bids: JSON.parse(JSON.stringify(this.bids)),
                bidIdCounter: this.bidIdCounter,
                createdAt: new Date().toISOString()
            };

            this.scenarios.push(scenarioData);
            this.currentScenarioId = scenarioData.id;
            this.newScenarioName = '';
            this.persistScenarios();
        },

        /**
         * 更新当前方案
         */
        updateScenario() {
            if (!this.currentScenarioId) return;

            const scenario = this.scenarios.find(s => s.id === this.currentScenarioId);
            if (!scenario) return;

            scenario.config = JSON.parse(JSON.stringify(this.config));
            scenario.bids = JSON.parse(JSON.stringify(this.bids));
            scenario.bidIdCounter = this.bidIdCounter;
            scenario.updatedAt = new Date().toISOString();
            this.persistScenarios();
        },

        /**
         * 加载方案
         */
        loadScenario(id) {
            const scenario = this.scenarios.find(s => s.id === id);
            if (!scenario) return;

            this.config = JSON.parse(JSON.stringify(scenario.config));
            this.bids = JSON.parse(JSON.stringify(scenario.bids));
            this.bidIdCounter = scenario.bidIdCounter;
            this.currentScenarioId = id;
            this.compareMode = false;
            this.compareScenarioIds = [];
        },

        /**
         * 删除方案
         */
        deleteScenario(id) {
            this.scenarios = this.scenarios.filter(s => s.id !== id);
            this.compareScenarioIds = this.compareScenarioIds.filter(sid => sid !== id);
            this.selectedExportIds = this.selectedExportIds.filter(sid => sid !== id);
            if (this.currentScenarioId === id) {
                this.currentScenarioId = null;
            }
            if (this.compareScenarioIds.length < 2) {
                this.compareMode = false;
            }
            this.persistScenarios();
        },

        /**
         * 切换方案对比选择
         */
        toggleCompareScenario(id) {
            const index = this.compareScenarioIds.indexOf(id);
            if (index > -1) {
                this.compareScenarioIds.splice(index, 1);
            } else {
                if (this.compareScenarioIds.length < 4) {
                    this.compareScenarioIds.push(id);
                }
            }
            this.compareMode = this.compareScenarioIds.length >= 2;
        },

        /**
         * 获取方案的计算结果
         */
        getScenarioResults(scenario) {
            const tempConfig = this.config;
            const tempBids = this.bids;

            this.config = JSON.parse(JSON.stringify(scenario.config));
            this.bids = JSON.parse(JSON.stringify(scenario.bids));

            const results = {
                scenarioId: scenario.id,
                scenarioName: scenario.name,
                config: scenario.config,
                baselinePrice: this.baselinePrice,
                validBidsCount: this.validBidsCount,
                lowestValidPrice: this.lowestValidPrice,
                averageValidPrice: this.averageValidPrice,
                sortedResults: this.sortedResults
            };

            this.config = tempConfig;
            this.bids = tempBids;

            return results;
        },

        /**
         * 获取对比的所有方案结果
         */
        get compareResults() {
            return this.compareScenarioIds.map(id => {
                const scenario = this.scenarios.find(s => s.id === id);
                return scenario ? this.getScenarioResults(scenario) : null;
            }).filter(Boolean);
        },

        /**
         * 获取所有投标人名称（用于对比表格）
         */
        get allBidderNames() {
            const names = new Set();
            this.compareResults.forEach(result => {
                result.sortedResults.forEach(r => names.add(r.name));
            });
            return Array.from(names);
        },

        /**
         * 获取投标人在指定方案中的数据
         */
        getBidderData(bidderName, scenarioResult) {
            return scenarioResult.sortedResults.find(r => r.name === bidderName);
        },

        // ========== 本地持久化 ==========

        /**
         * 将方案列表写入 localStorage
         */
        persistScenarios() {
            try {
                const payload = {
                    version: 1,
                    savedAt: new Date().toISOString(),
                    scenarioIdCounter: this.scenarioIdCounter,
                    scenarios: this.scenarios
                };
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
            } catch (err) {
                console.warn('方案保存到本地失败:', err);
            }
        },

        /**
         * 从 localStorage 恢复方案；存储损坏时静默回退为空列表，不影响应用启动
         */
        restoreScenarios() {
            try {
                const raw = localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return;

                const payload = JSON.parse(raw);
                if (!payload || !Array.isArray(payload.scenarios)) return;

                const restored = [];
                let scenarioSeq = 0;
                let bidSeq = 0;
                payload.scenarios.forEach(rawScenario => {
                    const scenario = this.normalizeScenario(rawScenario);
                    if (!scenario) return;
                    // 重新编排内部 ID，保证刷新后列表与计算引用一致
                    scenario.id = ++scenarioSeq;
                    scenario.bids.forEach(b => { b.id = ++bidSeq; });
                    scenario.bidIdCounter = bidSeq;
                    restored.push(scenario);
                });

                this.scenarios = restored;
                this.scenarioIdCounter = scenarioSeq;
            } catch (err) {
                console.warn('本地方案恢复失败:', err);
            }
        },

        // ========== 数据校验与规范化 ==========

        /**
         * 默认配置（导入文件缺字段时补默认值）
         */
        defaultConfig() {
            return {
                mode: 'single',
                maxPrice: null,
                minPrice: null,
                fullScore: 30,
                deductUp: 1.0,
                deductDown: 0.5,
                minScore: 0,
                lowestWeight: 40
            };
        },

        /**
         * 校验并规范化评标配置，不合法返回 null
         */
        normalizeConfig(raw) {
            if (!raw || typeof raw !== 'object') return null;
            if (raw.mode !== 'single' && raw.mode !== 'double') return null;

            const finiteOrDefault = (v, fallback) => {
                if (v === null || v === undefined || v === '') return fallback;
                const n = Number(v);
                return Number.isFinite(n) ? n : fallback;
            };
            const nullablePrice = (v) => {
                if (v === null || v === undefined || v === '') return null;
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            };

            const defaults = this.defaultConfig();
            return {
                mode: raw.mode,
                maxPrice: nullablePrice(raw.maxPrice),
                minPrice: nullablePrice(raw.minPrice),
                fullScore: finiteOrDefault(raw.fullScore, defaults.fullScore),
                deductUp: finiteOrDefault(raw.deductUp, defaults.deductUp),
                deductDown: finiteOrDefault(raw.deductDown, defaults.deductDown),
                minScore: finiteOrDefault(raw.minScore, defaults.minScore),
                lowestWeight: finiteOrDefault(raw.lowestWeight, defaults.lowestWeight)
            };
        },

        /**
         * 校验并规范化单个方案，不合法返回 null（不抛出、不修改任何现有数据）
         */
        normalizeScenario(raw) {
            if (!raw || typeof raw !== 'object') return null;
            if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
            if (!Array.isArray(raw.bids)) return null;

            const config = this.normalizeConfig(raw.config);
            if (!config) return null;

            const bids = [];
            for (const rawBid of raw.bids) {
                if (!rawBid || typeof rawBid !== 'object') return null;
                if (typeof rawBid.name !== 'string' || !rawBid.name.trim()) return null;
                const price = Number(rawBid.price);
                if (!Number.isFinite(price) || price <= 0) return null;
                bids.push({ id: null, name: rawBid.name.trim(), price });
            }

            return {
                id: null,
                name: raw.name.trim(),
                config,
                bids,
                bidIdCounter: 0,
                createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
                updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
            };
        },

        // ========== 导出 ==========

        /**
         * 构造导出文件内容（携带导出时间、评标模式等元信息）
         */
        buildExportPayload(scenarioList) {
            const modes = Array.from(new Set(scenarioList.map(s => s.config.mode)));
            return {
                app: 'bid-calculator',
                version: 1,
                exportedAt: new Date().toISOString(),
                exportedAtText: new Date().toLocaleString('zh-CN', { hour12: false }),
                count: scenarioList.length,
                modes: modes.map(m => this.modeLabel(m)),
                scenarios: scenarioList.map(s => ({
                    name: s.name,
                    mode: s.config.mode,
                    config: JSON.parse(JSON.stringify(s.config)),
                    bids: s.bids.map(b => ({ name: b.name, price: b.price })),
                    createdAt: s.createdAt || null,
                    updatedAt: s.updatedAt || null
                }))
            };
        },

        /**
         * 触发浏览器下载 JSON 文件
         */
        downloadJSON(payload, filename) {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        },

        /**
         * 文件名用时间戳（YYYYMMDD-HHMM）
         */
        dateStamp() {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
        },

        /**
         * 导出全部已保存方案（保持原有单文件导出行为）
         */
        exportScenarios() {
            if (this.scenarios.length === 0) return;
            const payload = this.buildExportPayload(this.scenarios);
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `报价方案_${new Date().toLocaleDateString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('success', `已导出全部 ${this.scenarios.length} 个方案`);
        },

        /**
         * 导出单个方案
         */
        exportSingleScenario(id) {
            const scenario = this.scenarios.find(s => s.id === id);
            if (!scenario) return;
            const payload = this.buildExportPayload([scenario]);
            this.downloadJSON(payload, `报价方案_${scenario.name}_${this.dateStamp()}.json`);
            this.showToast('success', `已导出方案「${scenario.name}」`);
        },

        /**
         * 多选模式：切换勾选
         */
        toggleExportSelectMode() {
            this.exportSelectMode = !this.exportSelectMode;
            if (!this.exportSelectMode) this.selectedExportIds = [];
        },

        toggleExportSelected(id) {
            const index = this.selectedExportIds.indexOf(id);
            if (index > -1) {
                this.selectedExportIds.splice(index, 1);
            } else {
                this.selectedExportIds.push(id);
            }
        },

        selectAllExport() {
            this.selectedExportIds = this.scenarios.map(s => s.id);
        },

        clearExportSelection() {
            this.selectedExportIds = [];
        },

        /**
         * 将勾选的多个方案合并导出为一个文件
         */
        exportSelectedScenarios() {
            const selected = this.scenarios.filter(s => this.selectedExportIds.includes(s.id));
            if (selected.length === 0) {
                this.showToast('info', '请先勾选需要合并导出的方案');
                return;
            }
            const payload = this.buildExportPayload(selected);
            this.downloadJSON(payload, `报价方案_合并${selected.length}个_${this.dateStamp()}.json`);
            this.showToast('success', `已合并导出 ${selected.length} 个方案`);
        },

        // ========== 导入 ==========

        /**
         * 选择文件后导入：先整体校验，再按同名情况决定直接入库或弹出冲突选择
         * 关键保证：任何一步失败都不修改 this.scenarios，原有方案一条不丢
         */
        importScenarios(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                let data;
                try {
                    data = JSON.parse(e.target.result);
                } catch (err) {
                    this.showToast('error', '导入失败：文件不是有效的 JSON，原有方案未受影响');
                    return;
                }

                let incoming;
                try {
                    if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
                        throw new Error('缺少方案列表');
                    }
                    if (data.scenarios.length === 0) {
                        throw new Error('文件中没有方案');
                    }
                    // 全量校验：只要有一条格式不对，整批拒绝
                    incoming = data.scenarios.map((raw, index) => {
                        const scenario = this.normalizeScenario(raw);
                        if (!scenario) throw new Error(`第 ${index + 1} 个方案数据不完整或字段非法`);
                        scenario._tempId = `imp-${index}`;
                        return scenario;
                    });
                } catch (err) {
                    this.showToast('error', `导入失败：${err.message}，原有方案未受影响`);
                    return;
                }

                const conflicts = this.buildImportConflicts(incoming);
                const modeLabels = Array.from(new Set(incoming.map(s => this.modeLabel(s.config.mode))));

                if (conflicts.length === 0) {
                    // 无同名冲突，直接提交，不弹窗
                    const summary = this.commitIncoming(incoming, new Map());
                    this.showToast('success', `导入完成：新增 ${summary.added} 个方案`);
                    return;
                }

                this.importModal = {
                    open: true,
                    fileName: file.name,
                    exportedAtText: data.exportedAtText || this.formatDateTime(data.exportedAt),
                    modeLabels,
                    incoming,
                    conflicts,
                    newCount: incoming.length - conflicts.length
                };
            };
            reader.onerror = () => {
                this.showToast('error', '导入失败：文件读取失败，原有方案未受影响');
            };
            reader.readAsText(file);
            event.target.value = '';
        },

        /**
         * 构造同名冲突列表：与当前已保存方案同名，或导入文件内部自身重名
         */
        buildImportConflicts(incoming) {
            const conflicts = [];
            const seenNames = new Set();
            incoming.forEach(s => {
                const existing = this.scenarios.find(e => e.name === s.name);
                if (existing) {
                    conflicts.push({
                        key: s._tempId,
                        name: s.name,
                        incoming: s,
                        against: existing,
                        againstIsExisting: true,
                        // 文件内第一条同名的默认建议覆盖，后续同名默认跳过
                        decision: seenNames.has(s.name) ? 'skip' : 'overwrite',
                        bidRows: this.buildBidRows(existing, s),
                        configDiffs: this.buildConfigDiffs(existing.config, s.config)
                    });
                } else if (seenNames.has(s.name)) {
                    const first = incoming.find(x => x.name === s.name);
                    conflicts.push({
                        key: s._tempId,
                        name: s.name,
                        incoming: s,
                        against: first,
                        againstIsExisting: false,
                        decision: 'skip',
                        bidRows: this.buildBidRows(first, s),
                        configDiffs: this.buildConfigDiffs(first.config, s.config)
                    });
                }
                seenNames.add(s.name);
            });
            return conflicts;
        },

        /**
         * 按投标单位逐条比对报价，返回每个单位的状态：
         * same 一致 / changed 报价变更 / added 文件新增 / removed 覆盖后将移除
         */
        buildBidRows(against, incoming) {
            const rowMap = new Map();
            against.bids.forEach(b => {
                rowMap.set(b.name, { name: b.name, againstPrice: b.price, incomingPrice: null });
            });
            incoming.bids.forEach(b => {
                const row = rowMap.get(b.name);
                if (row) {
                    row.incomingPrice = b.price;
                } else {
                    rowMap.set(b.name, { name: b.name, againstPrice: null, incomingPrice: b.price });
                }
            });

            return Array.from(rowMap.values()).map(row => {
                let status;
                if (row.againstPrice !== null && row.incomingPrice !== null) {
                    status = row.againstPrice === row.incomingPrice ? 'same' : 'changed';
                } else if (row.incomingPrice !== null) {
                    status = 'added';
                } else {
                    status = 'removed';
                }
                return { ...row, status };
            });
        },

        /**
         * 比对评标参数差异
         */
        buildConfigDiffs(a, b) {
            const priceText = (v) => (v === null || v === undefined) ? '不限' : `${Number(v)}`;
            const fields = [
                { key: 'mode', label: '评标模式', fmt: (v) => this.modeLabel(v) },
                { key: 'fullScore', label: '满分', fmt: (v) => `${v}分` },
                { key: 'minScore', label: '最低分', fmt: (v) => `${v}分` },
                { key: 'deductUp', label: '上浮扣分/1%', fmt: (v) => `${v}` },
                { key: 'deductDown', label: '下浮扣分/1%', fmt: (v) => `${v}` },
                { key: 'lowestWeight', label: '最低价权重', fmt: (v) => `${v}%` },
                { key: 'maxPrice', label: '上限价', fmt: priceText },
                { key: 'minPrice', label: '下限价', fmt: priceText }
            ];
            return fields
                .filter(f => String(a[f.key]) !== String(b[f.key]))
                .map(f => ({ label: f.label, oldText: f.fmt(a[f.key]), newText: f.fmt(b[f.key]) }));
        },

        /**
         * 批量设置冲突处理方式
         */
        setAllConflictDecisions(decision) {
            this.importModal.conflicts.forEach(c => { c.decision = decision; });
        },

        /**
         * 取消导入：仅关闭弹窗，不触碰任何现有数据
         */
        cancelImport() {
            this.importModal.open = false;
            this.importModal.incoming = [];
            this.importModal.conflicts = [];
            this.showToast('info', '已取消导入，原有方案未改动');
        },

        /**
         * 确认导入：根据冲突选择一次性原子提交
         */
        applyImport() {
            try {
                const decisionByTempId = new Map();
                this.importModal.conflicts.forEach(c => decisionByTempId.set(c.key, c.decision));
                const summary = this.commitIncoming(this.importModal.incoming, decisionByTempId);
                this.importModal.open = false;
                this.importModal.incoming = [];
                this.importModal.conflicts = [];
                this.showToast('success', `导入完成：新增 ${summary.added} 个，覆盖 ${summary.overwritten} 个，跳过 ${summary.skipped} 个`);
            } catch (err) {
                console.error('导入提交失败:', err);
                this.showToast('error', '导入失败：提交时出现异常，原有方案未受影响');
            }
        },

        /**
         * 原子提交：先在副本上完成全部变更，成功后才替换 this.scenarios
         * 返回 { added, overwritten, skipped }
         */
        commitIncoming(incoming, decisionByTempId) {
            const working = [...this.scenarios];

            // 以现有全部报价ID的最大值为起点，保证导入后报价ID全局不冲突
            let nextBidId = this.bidIdCounter;
            working.forEach(s => {
                s.bids.forEach(b => { if (Number.isFinite(b.id) && b.id > nextBidId) nextBidId = b.id; });
            });
            let nextScenarioId = this.scenarioIdCounter;

            let added = 0;
            let overwritten = 0;
            let skipped = 0;
            let overwrittenCurrentId = null;
            const nowIso = new Date().toISOString();

            for (const incomingScenario of incoming) {
                const decision = decisionByTempId.get(incomingScenario._tempId) || 'add';
                if (decision === 'skip') {
                    skipped++;
                    continue;
                }

                const bids = incomingScenario.bids.map(b => ({
                    id: ++nextBidId,
                    name: b.name,
                    price: b.price
                }));

                const index = working.findIndex(s => s.name === incomingScenario.name);
                if (index > -1) {
                    // 覆盖：保留原方案ID与创建时间，内容整体替换
                    const target = working[index];
                    working[index] = {
                        id: target.id,
                        name: incomingScenario.name,
                        config: incomingScenario.config,
                        bids,
                        bidIdCounter: nextBidId,
                        createdAt: target.createdAt || nowIso,
                        updatedAt: nowIso,
                        importedAt: nowIso
                    };
                    if (this.currentScenarioId === target.id) {
                        overwrittenCurrentId = target.id;
                    }
                    overwritten++;
                } else {
                    const id = ++nextScenarioId;
                    working.push({
                        id,
                        name: incomingScenario.name,
                        config: incomingScenario.config,
                        bids,
                        bidIdCounter: nextBidId,
                        createdAt: incomingScenario.createdAt || nowIso,
                        importedAt: nowIso
                    });
                    added++;
                }
            }

            // 全部处理完成，一次性替换并持久化
            this.scenarios = working;
            this.scenarioIdCounter = nextScenarioId;
            this.bidIdCounter = nextBidId;
            this.persistScenarios();

            // 当前正在查看/编辑的方案被覆盖时，同步刷新编辑区与得分结果
            if (overwrittenCurrentId !== null) {
                this.loadScenario(overwrittenCurrentId);
            }

            return { added, overwritten, skipped };
        },

        // ========== 展示辅助 ==========

        /**
         * 评标模式中文名称
         */
        modeLabel(mode) {
            return mode === 'double' ? '双低模式' : '单低模式';
        },

        /**
         * ISO 时间转本地可读时间
         */
        formatDateTime(iso) {
            if (!iso) return '未知';
            const d = new Date(iso);
            return Number.isNaN(d.getTime()) ? '未知' : d.toLocaleString('zh-CN', { hour12: false });
        },

        /**
         * 报价显示
         */
        formatPrice(value) {
            return value === null || value === undefined ? '—' : Number(value).toFixed(2);
        },

        /**
         * 全局轻提示
         */
        showToast(type, message) {
            this.toast = { show: true, type, message };
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => { this.toast.show = false; }, 3500);
        },

        // ========== 计算逻辑 ==========

        /**
         * 检查报价是否有效（限价判断）
         * - 超过上限价 → 废标
         * - 低于下限价 → 废标
         */
        checkValidity(price) {
            if (this.config.maxPrice !== null && this.config.maxPrice !== '' && price > this.config.maxPrice) {
                return { valid: false, reason: '超上限' };
            }
            if (this.config.minPrice !== null && this.config.minPrice !== '' && price < this.config.minPrice) {
                return { valid: false, reason: '低下限' };
            }
            return { valid: true, reason: '' };
        },

        /**
         * 获取所有有效报价
         */
        get validBids() {
            return this.bids.filter(bid => this.checkValidity(bid.price).valid);
        },

        /**
         * 有效报价数量
         */
        get validBidsCount() {
            return this.validBids.length;
        },

        /**
         * 最低有效报价
         */
        get lowestValidPrice() {
            if (this.validBids.length === 0) return null;
            return Math.min(...this.validBids.map(b => b.price));
        },

        /**
         * 有效报价平均值
         */
        get averageValidPrice() {
            if (this.validBids.length === 0) return null;
            const sum = this.validBids.reduce((acc, b) => acc + b.price, 0);
            return sum / this.validBids.length;
        },

        /**
         * 计算评标基准价
         * - 单低模式：基准价 = 最低有效报价
         * - 双低模式：基准价 = 最低有效价 × A% + 平均有效价 × B%
         */
        get baselinePrice() {
            if (this.validBids.length === 0) return null;

            if (this.config.mode === 'single') {
                return this.lowestValidPrice;
            } else {
                const lowestWeight = this.config.lowestWeight / 100;
                const avgWeight = 1 - lowestWeight;
                return this.lowestValidPrice * lowestWeight + this.averageValidPrice * avgWeight;
            }
        },

        /**
         * 计算偏离率
         * 偏离率 = (报价 - 基准价) / 基准价 × 100%
         * 正值表示高于基准价，负值表示低于基准价
         */
        calculateDeviation(price) {
            if (!this.baselinePrice) return 0;
            return ((price - this.baselinePrice) / this.baselinePrice) * 100;
        },

        /**
         * 计算扣分
         * - 报价 > 基准价：扣分 = 偏离率 × 上浮扣分系数
         * - 报价 < 基准价：扣分 = |偏离率| × 下浮扣分系数
         * - 报价 = 基准价：扣分 = 0
         */
        calculateDeduction(price) {
            if (!this.baselinePrice) return 0;

            const deviation = this.calculateDeviation(price);

            if (deviation > 0) {
                return deviation * this.config.deductUp;
            } else if (deviation < 0) {
                return Math.abs(deviation) * this.config.deductDown;
            }
            return 0;
        },

        /**
         * 计算最终得分
         * 得分 = 满分 - 扣分
         * 最终得分不低于最低得分限制
         */
        calculateScore(price) {
            if (!this.baselinePrice) return 0;

            const deduction = this.calculateDeduction(price);
            let score = this.config.fullScore - deduction;

            score = Math.max(score, this.config.minScore);
            score = Math.min(score, this.config.fullScore);

            return score;
        },

        /**
         * 排序后的结果（按得分降序）
         */
        get sortedResults() {
            const results = this.bids.map(bid => {
                const validity = this.checkValidity(bid.price);
                const isValid = validity.valid;

                return {
                    id: bid.id,
                    name: bid.name,
                    price: bid.price,
                    isValid: isValid,
                    invalidReason: validity.reason,
                    deviation: isValid ? this.calculateDeviation(bid.price) : 0,
                    deduction: isValid ? this.calculateDeduction(bid.price) : 0,
                    score: isValid ? this.calculateScore(bid.price) : 0
                };
            });

            // 排序：有效报价在前，按得分降序；无效报价在后
            results.sort((a, b) => {
                if (a.isValid && !b.isValid) return -1;
                if (!a.isValid && b.isValid) return 1;
                if (!a.isValid && !b.isValid) return 0;
                if (b.score !== a.score) return b.score - a.score;
                return a.price - b.price;
            });

            // 添加排名（同分同名次）
            let rank = 0;
            let lastScore = null;
            let skipCount = 0;

            results.forEach((r, i) => {
                if (r.isValid) {
                    if (r.score !== lastScore) {
                        rank = rank + 1 + skipCount;
                        skipCount = 0;
                    } else {
                        skipCount++;
                    }
                    r.rank = rank;
                    lastScore = r.score;
                } else {
                    r.rank = null;
                }
            });

            return results;
        }
    }
}
