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

        // ========== 合并导出（多选） ==========

        // 是否处于"勾选导出"模式
        exportSelectMode: false,

        // 勾选待合并导出的方案ID列表
        selectedExportIds: [],

        // ========== 导入冲突处理 ==========

        // 导入弹窗状态
        importModal: {
            visible: false,
            queue: [],            // 待导入方案（已校验、已规范化）
            index: 0,             // 当前处理位置
            overwriteAll: false,  // 用户选择"全部覆盖"
            skipAll: false,       // 用户选择"全部跳过"
            addedCount: 0,
            overwrittenCount: 0,
            skippedCount: 0,
            exportedAt: '',       // 导出文件携带的导出时间
            fileMode: ''          // 导出文件携带的评标模式
        },

        // ========== 全局提示 ==========

        toast: {
            visible: false,
            message: '',
            type: 'info'          // info | success | error
        },
        toastTimer: null,

        // 本地持久化键名
        STORAGE_KEY: 'bid-calculator-scenarios-v1',
        EXPORT_APP: 'bid-calculator',
        EXPORT_VERSION: 2,

        /**
         * Alpine 初始化：从本地存储恢复已保存方案
         */
        init() {
            this.loadFromStorage();
        },

        // ========== 本地持久化 ==========

        /**
         * 持久化方案数据（刷新/重开后仍在）
         */
        persistScenarios() {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                    scenarios: this.scenarios,
                    scenarioIdCounter: this.scenarioIdCounter,
                    currentScenarioId: this.currentScenarioId
                }));
            } catch (err) {
                console.warn('方案数据保存失败:', err);
            }
        },

        /**
         * 从本地存储恢复方案数据
         */
        loadFromStorage() {
            try {
                const raw = localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);
                if (data && Array.isArray(data.scenarios)) {
                    this.scenarios = data.scenarios;
                    this.scenarioIdCounter = data.scenarioIdCounter || 0;
                    const currentId = data.currentScenarioId;
                    if (currentId && this.scenarios.some(s => s.id === currentId)) {
                        this.currentScenarioId = currentId;
                    }
                }
            } catch (err) {
                console.warn('方案数据恢复失败:', err);
            }
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
            if (this.selectedExportIds.length === 0) {
                this.exportSelectMode = false;
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

        // ========== 方案导出 ==========

        /**
         * 全局提示
         */
        showToast(message, type = 'info') {
            this.toast = { visible: true, message, type };
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                this.toast.visible = false;
            }, 3200);
        },

        /**
         * 评标模式文案
         */
        modeLabel(mode) {
            if (mode === 'single') return '单低';
            if (mode === 'double') return '双低';
            return '未知';
        },

        /**
         * 格式化时间（本地可读格式）
         */
        formatDateTime(iso) {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso || '-';
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        },

        /**
         * 计算一批方案的整体评标模式：全部一致则单低/双低，否则为混合
         */
        getExportMode(scenarioList) {
            const modes = new Set(scenarioList.map(s => s.config && s.config.mode));
            if (modes.size === 1) return modes.has('single') ? 'single' : 'double';
            if (modes.size === 0) return 'unknown';
            return 'mixed';
        },

        /**
         * 构造导出内容：含导出时间与评标模式
         * （同时兼容旧版导出：scenarios 数组保留在顶层）
         */
        buildExportPayload(scenarioList) {
            const exportedAt = new Date().toISOString();
            return {
                app: this.EXPORT_APP,
                version: this.EXPORT_VERSION,
                exportedAt,
                exportedAtLocal: this.formatDateTime(exportedAt),
                mode: this.getExportMode(scenarioList),
                modeLabel: this.modeLabelText(this.getExportMode(scenarioList)),
                count: scenarioList.length,
                scenarios: scenarioList
            };
        },

        modeLabelText(mode) {
            if (mode === 'single') return '单低模式';
            if (mode === 'double') return '双低模式';
            if (mode === 'mixed') return '混合模式';
            return '未知';
        },

        /**
         * 下载 JSON 文件
         */
        downloadJson(payload, filename) {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        safeFileName(name) {
            return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '方案';
        },

        /**
         * 导出全部已保存方案（原有行为保持不变，文件同时带上导出时间与评标模式）
         */
        exportScenarios() {
            if (this.scenarios.length === 0) return;
            const payload = this.buildExportPayload(JSON.parse(JSON.stringify(this.scenarios)));
            const dateStr = new Date().toLocaleDateString();
            this.downloadJson(payload, `报价方案_${dateStr}.json`);
        },

        /**
         * 导出单个方案
         */
        exportSingleScenario(id) {
            const scenario = this.scenarios.find(s => s.id === id);
            if (!scenario) return;
            const payload = this.buildExportPayload([JSON.parse(JSON.stringify(scenario))]);
            const dateStr = new Date().toLocaleDateString();
            this.downloadJson(payload, `报价方案_${this.safeFileName(scenario.name)}_${dateStr}.json`);
        },

        /**
         * 进入/退出"多选合并导出"模式
         */
        toggleExportSelectMode() {
            this.exportSelectMode = !this.exportSelectMode;
            if (!this.exportSelectMode) this.selectedExportIds = [];
        },

        /**
         * 勾选/取消勾选用于合并导出的方案
         */
        toggleExportSelection(id) {
            const index = this.selectedExportIds.indexOf(id);
            if (index > -1) {
                this.selectedExportIds.splice(index, 1);
            } else {
                this.selectedExportIds.push(id);
            }
        },

        /**
         * 全选/取消全选
         */
        toggleSelectAllExport() {
            if (this.selectedExportIds.length === this.scenarios.length) {
                this.selectedExportIds = [];
            } else {
                this.selectedExportIds = this.scenarios.map(s => s.id);
            }
        },

        /**
         * 合并导出勾选的多个方案
         */
        exportSelectedScenarios() {
            const selected = this.scenarios.filter(s => this.selectedExportIds.includes(s.id));
            if (selected.length === 0) {
                this.showToast('请先勾选要导出的方案', 'error');
                return;
            }            const payload = this.buildExportPayload(JSON.parse(JSON.stringify(selected)));
            const dateStr = new Date().toLocaleDateString();
            const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '-');
            this.downloadJson(payload, `报价方案_合并${selected.length}个_${dateStr}_${timeStr}.json`);
            this.showToast(`已合并导出 ${selected.length} 个方案`, 'success');
            this.exportSelectMode = false;
            this.selectedExportIds = [];
        },

        // ========== 方案导入 ==========

        /**
         * 读取并校验导入文件
         * 关键：先对全部方案做严格校验，任一格式不对则整体中止，原有方案一条都不丢
         */
        importScenarios(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                let rawList;
                let meta;
                try {
                    const data = JSON.parse(e.target.result);
                    // 兼容旧版导出格式 { scenarios: [...] }
                    if (!data || !Array.isArray(data.scenarios)) {
                        throw new Error('文件中缺少 scenarios 方案列表');
                    }
                    rawList = data.scenarios;
                    meta = {
                        exportedAt: data.exportedAt || '',
                        fileMode: data.mode || ''
                    };
                } catch (err) {
                    this.showToast(`导入失败：文件格式不正确（${err.message}），原有方案未改动`, 'error');
                    return;
                }

                if (rawList.length === 0) {
                    this.showToast('导入失败：文件中没有任何方案，原有方案未改动', 'error');
                    return;
                }

                // 全量校验：任一方案不合法则整体中止，绝不改动现有数据
                let normalized;
                try {
                    normalized = rawList.map(s => this.normalizeScenario(s));
                } catch (err) {
                    this.showToast(`导入失败：${err.message}。原有方案一条都未丢失`, 'error');
                    return;
                }

                this.startImport(normalized, meta);
            };
            reader.onerror = () => {
                this.showToast('导入失败：文件读取失败，原有方案未改动', 'error');
            };
            reader.readAsText(file);
        },

        /**
         * 校验并规范化单个方案，任何字段不合法都抛出错误
         */
        normalizeScenario(raw) {
            if (typeof raw !== 'object' || raw === null) {
                throw new Error('存在不是有效方案对象的数据');
            }
            if (typeof raw.name !== 'string' || !raw.name.trim()) {
                throw new Error('存在缺少方案名称的数据');
            }
            if (typeof raw.config !== 'object' || raw.config === null) {
                throw new Error(`方案「${raw.name}」缺少评标配置`);
            }
            if (raw.config.mode !== 'single' && raw.config.mode !== 'double') {
                throw new Error(`方案「${raw.name}」的评标模式无效`);
            }
            const numericFields = ['maxPrice', 'minPrice', 'fullScore', 'deductUp', 'deductDown', 'minScore', 'lowestWeight'];
            numericFields.forEach(field => {
                const v = raw.config[field];
                // undefined 视为字段缺失，后续用默认值补全；null/'' 表示不限制；其余必须是数字
                if (v !== undefined && v !== null && v !== '' && (typeof v !== 'number' || isNaN(v))) {
                    throw new Error(`方案「${raw.name}」的参数 ${field} 不是有效数字`);
                }
            });
            if (!Array.isArray(raw.bids)) {
                throw new Error(`方案「${raw.name}」缺少投标报价列表`);
            }
            const bids = raw.bids.map((bid, i) => {
                if (typeof bid !== 'object' || bid === null) {
                    throw new Error(`方案「${raw.name}」中第 ${i + 1} 条报价格式不正确`);
                }
                if (typeof bid.name !== 'string' || !bid.name.trim()) {
                    throw new Error(`方案「${raw.name}」中第 ${i + 1} 条报价缺少投标单位名称`);
                }
                const price = Number(bid.price);
                if (!isFinite(price) || price <= 0) {
                    throw new Error(`方案「${raw.name}」中「${bid.name}」的报价不是有效正数`);
                }
                return { name: bid.name.trim(), price };
            });
            if (bids.length === 0) {
                throw new Error(`方案「${raw.name}」没有任何投标报价`);
            }

            // 深拷贝配置并补全缺失字段（防止旧文件缺少新增参数）
            const defaultConfig = {
                mode: 'single', maxPrice: null, minPrice: null,
                fullScore: 30, deductUp: 1.0, deductDown: 0.5,
                minScore: 0, lowestWeight: 40
            };
            const rawConfig = JSON.parse(JSON.stringify(raw.config));
            Object.keys(rawConfig).forEach(key => {
                if (rawConfig[key] === undefined) delete rawConfig[key];
            });
            const config = Object.assign({}, defaultConfig, rawConfig);

            return {
                name: raw.name.trim(),
                config,
                bids,
                createdAt: raw.createdAt || null,
                updatedAt: raw.updatedAt || null,
                importedAt: new Date().toISOString()
            };
        },

        /**
         * 开始导入：无同名的方案直接新增，同名方案进入逐条确认流程
         */
        startImport(queue, meta) {
            this.importModal = {
                visible: true,
                queue,
                index: 0,
                overwriteAll: false,
                skipAll: false,
                addedCount: 0,
                overwrittenCount: 0,
                skippedCount: 0,
                exportedAt: meta.exportedAt || '',
                fileMode: meta.fileMode || ''
            };
            // 先自动加入所有无同名冲突的方案（同名判定按方案名称）
            let i = 0;
            while (i < this.importModal.queue.length) {
                const item = this.importModal.queue[i];
                const existing = this.scenarios.find(s => s.name === item.name);
                if (existing) {
                    i++;
                    continue;
                }
                this.applyImportScenario(item, false);
                this.importModal.addedCount++;
                this.importModal.queue.splice(i, 1);
            }
            if (this.importModal.queue.length === 0) {
                this.finishImport();
                return;
            }
            this.importModal.index = 0;
        },

        /**
         * 当前待处理的同名方案（导入侧）
         */
        get importCurrent() {
            return this.importModal.queue[this.importModal.index] || null;
        },

        /**
         * 当前同名方案（已存在侧）
         */
        get importExisting() {
            const current = this.importCurrent;
            return current ? this.scenarios.find(s => s.name === current.name) : null;
        },

        /**
         * 按投标单位与报价逐条比对：
         * same   单位与报价完全一致
         * changed 单位相同、报价不同
         * added  文件中有、当前方案没有的单位
         * removed 当前方案中有、文件中没有的单位
         */
        bidCompareRows(imported, existing) {
            if (!imported || !existing) return [];
            const rows = [];
            const usedExisting = new Set();

            imported.bids.forEach(ib => {
                const matchIdx = existing.bids.findIndex((eb, idx) =>
                    !usedExisting.has(idx) && eb.name === ib.name
                );
                if (matchIdx === -1) {
                    rows.push({ name: ib.name, status: 'added', importedPrice: ib.price, existingPrice: null });
                } else {
                    usedExisting.add(matchIdx);
                    const eb = existing.bids[matchIdx];
                    rows.push({
                        name: ib.name,
                        status: eb.price === ib.price ? 'same' : 'changed',
                        importedPrice: ib.price,
                        existingPrice: eb.price
                    });
                }
            });

            existing.bids.forEach((eb, idx) => {
                if (!usedExisting.has(idx)) {
                    rows.push({ name: eb.name, status: 'removed', importedPrice: null, existingPrice: eb.price });
                }
            });
            return rows;
        },

        /**
         * 处理当前同名方案：overwrite 覆盖 | skip 跳过
         */
        resolveImport(action) {
            const item = this.importCurrent;
            if (!item) return;

            const overwrite = action === 'overwrite' || action === 'overwriteAll';
            if (overwrite) {
                this.applyImportScenario(item, true);
                this.importModal.overwrittenCount++;
            } else {
                this.importModal.skippedCount++;
            }
            this.importModal.queue.splice(this.importModal.index, 1);

            // 批量决策应用于剩余同名方案
            if (action === 'overwriteAll') {
                this.importModal.overwriteAll = true;
            } else if (action === 'skipAll') {
                this.importModal.skipAll = true;
            }
            if (this.importModal.overwriteAll || this.importModal.skipAll) {
                const overwrite = this.importModal.overwriteAll;
                this.importModal.queue.forEach(q => {
                    if (overwrite) {
                        this.applyImportScenario(q, true);
                        this.importModal.overwrittenCount++;
                    } else {
                        // 跳过时不写入任何数据
                        this.importModal.skippedCount++;
                    }
                });
                this.importModal.queue = [];
                this.finishImport();
                return;
            }

            if (this.importModal.queue.length === 0) {
                this.finishImport();
            } else {
                this.importModal.index = Math.min(this.importModal.index, this.importModal.queue.length - 1);
            }
        },

        /**
         * 取消导入：已自动新增/已确认覆盖的方案保留，未处理的同名方案不再导入
         */
        cancelImport() {
            const remaining = this.importModal.queue.length;
            this.importModal.queue = [];
            this.importModal.visible = false;
            this.showToast(`已取消导入，剩余 ${remaining} 个同名方案未导入，已有方案均已保留`, 'info');
        },

        /**
         * 完成导入并汇总提示
         */
        finishImport() {
            const { addedCount, overwrittenCount, skippedCount } = this.importModal;
            this.importModal.visible = false;
            const parts = [];
            if (addedCount) parts.push(`新增 ${addedCount} 个`);
            if (overwrittenCount) parts.push(`覆盖 ${overwrittenCount} 个`);
            if (skippedCount) parts.push(`跳过 ${skippedCount} 个`);
            this.showToast(`导入完成：${parts.join('，') || '无变更'}`, 'success');
        },

        /**
         * 写入一个导入方案（新增或覆盖同名方案）
         * 覆盖时保留原方案 id；写入后重新规整报价 id，保证列表与得分计算一致
         */
        applyImportScenario(item, overwrite) {
            const bids = item.bids.map((bid, idx) => ({
                id: idx + 1,
                name: bid.name,
                price: bid.price
            }));
            const scenarioData = {
                name: item.name,
                config: JSON.parse(JSON.stringify(item.config)),
                bids,
                bidIdCounter: bids.length,
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                importedAt: item.importedAt || new Date().toISOString()
            };

            if (overwrite) {
                const index = this.scenarios.findIndex(s => s.name === item.name);
                if (index > -1) {
                    scenarioData.id = this.scenarios[index].id;
                    const wasCurrent = this.currentScenarioId === scenarioData.id;
                    this.scenarios[index] = scenarioData;
                    // 当前正在查看/编辑的就是被覆盖方案时，同步刷新界面与得分结果
                    if (wasCurrent) {
                        this.loadScenario(scenarioData.id);
                    }
                    this.persistScenarios();
                    return;
                }
            }
            scenarioData.id = ++this.scenarioIdCounter;
            this.scenarios.push(scenarioData);
            this.persistScenarios();
        },

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
