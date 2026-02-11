document.addEventListener('DOMContentLoaded', () => {
    // Constants
    const CURRENCIES = {
        USD: { symbol: '$', name: 'USD' },
        EUR: { symbol: '€', name: 'EUR' },
        RUB: { symbol: '₽', name: 'RUB' },
        KRW: { symbol: '₩', name: 'KRW' }
    };

    // State
    let balances = { USD: 0, EUR: 0, RUB: 0, KRW: 0 };
    let debts = {}; // { "Name": { "USD": 100, "EUR": -50 } }
    let counterparties = []; // List of names
    let transactions = []; // Array of { id, date, amount, currency, type, isDebt, counterparty, debtType }
    let defaultCurrency = 'USD';
    let currentType = 'income';
    let isDebtMode = false;
    let isRepaymentMode = false;
    let debtType = 'lend';

    // Init State from LocalStorage
    loadData();

    // DOM Elements - Main
    const balanceEl = document.getElementById('balance-amount');
    const secondaryBalancesEl = document.getElementById('secondary-balances');
    const debtsContainerEl = document.getElementById('debts-container');
    const fabBtn = document.getElementById('add-btn');

    // DOM Elements - Transaction Modal
    const modal = document.getElementById('transaction-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const saveBtn = document.getElementById('save-transaction');
    const amountInput = document.getElementById('amount-input');
    const currencySelector = document.getElementById('currency-selector');
    const mainTypeSelector = document.querySelector('.transaction-type-selector:not(.small)');
    const typeBtns = document.querySelectorAll('.transaction-type-selector:not(.small) .type-btn');

    // DOM Elements - Details Modal
    const detailsModal = document.getElementById('details-modal');
    const closeDetailsModalBtn = document.getElementById('close-details-modal');
    const detailsTitle = document.getElementById('details-title');
    const detailsList = document.getElementById('details-list');

    // DOM Elements - Debt Specific
    const debtCheckbox = document.getElementById('is-debt-checkbox');
    const repaymentCheckbox = document.getElementById('is-repayment-checkbox');
    const debtDetails = document.getElementById('debt-details');
    const debtTypeBtns = document.querySelectorAll('.transaction-type-selector.small .type-btn');
    const counterpartyInput = document.getElementById('counterparty-input');
    const counterpartyDatalist = document.getElementById('counterparty-list');

    // DOM Elements - Menu
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('menu-overlay');
    const resetBtn = document.getElementById('reset-data');
    const defaultCurrencySelect = document.getElementById('default-currency-setting');
    const counterpartyMenuList = document.getElementById('counterparty-menu-list');

    // Init UI
    defaultCurrencySelect.value = defaultCurrency;
    updateDisplay();
    updateCounterpartyLists();

    // Handle bfcache restoration
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            loadData();
            updateDisplay();
        }
    });

    // Event Listeners
    fabBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    closeDetailsModalBtn.addEventListener('click', closeDetailsModal);
    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) closeDetailsModal();
    });

    saveBtn.addEventListener('click', saveTransaction);

    // Regular Income/Expense Toggle
    typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (isDebtMode) return;

            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
        });
    });

    // Debt Checkbox Toggle
    debtCheckbox.addEventListener('change', (e) => {
        isDebtMode = e.target.checked;
        if (isDebtMode) {
            debtDetails.classList.remove('hidden');
            mainTypeSelector.style.display = 'none';
            syncDebtToMainType();
        } else {
            debtDetails.classList.add('hidden');
            mainTypeSelector.style.display = 'flex';
            isRepaymentMode = false;
            repaymentCheckbox.checked = false;
            updateCounterpartyOptionList();
        }
    });

    // Repayment Checkbox Toggle
    if (repaymentCheckbox) {
        repaymentCheckbox.addEventListener('change', (e) => {
            isRepaymentMode = e.target.checked;
            lastValidInput = ''; // Reset on mode change
            counterpartyInput.value = ''; // Clear input to avoid invalid state stuck
            updateCounterpartyOptionList();
        });
    }

    // Counterparty Input Strict Validation
    let lastValidInput = '';
    counterpartyInput.addEventListener('input', (e) => {
        if (!isRepaymentMode) {
            lastValidInput = e.target.value;
            return;
        }

        const val = e.target.value;
        const allowed = getAllowedRepaymentCounterparties();

        // Allow empty string (deleting)
        if (val === '') {
            lastValidInput = '';
            return;
        }

        // Check if val is a prefix of at least one allowed name
        const isValid = allowed.some(name => name.toLowerCase().startsWith(val.toLowerCase()));

        if (isValid) {
            lastValidInput = val;
        } else {
            // Revert
            e.target.value = lastValidInput;
            // Optional: flash red or shake?
            e.target.style.borderColor = 'var(--expense-color)';
            setTimeout(() => e.target.style.borderColor = '', 300);
        }
    });

    // Debt Type Toggle
    debtTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            debtTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            debtType = btn.dataset.debtType;

            const mainTypeToSelect = debtType === 'lend' ? 'expense' : 'income';
            typeBtns.forEach(b => {
                if (b.dataset.type === mainTypeToSelect) {
                    b.click();
                }
            });
        });
    });

    // Menu logic
    menuBtn.addEventListener('click', openMenu);
    closeSidebarBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    resetBtn.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите сбросить все данные?')) {
            balances = { USD: 0, EUR: 0, RUB: 0, KRW: 0 };
            debts = {};
            counterparties = [];
            transactions = [];
            saveData();
            updateDisplay();
            updateCounterpartyLists();
            closeMenu();
        }
    });

    defaultCurrencySelect.addEventListener('change', (e) => {
        defaultCurrency = e.target.value;
        saveData();
        updateDisplay();
    });

    // --- Interaction Utility ---
    // Handles Click (Desktop) vs Long Press (Mobile)
    function attachInteraction(element, callback) {
        let timer;
        let isLongPress = false;
        let isTouch = false;

        // Touch Events (Mobile)
        element.addEventListener('touchstart', (e) => {
            isTouch = true;
            isLongPress = false;
            timer = setTimeout(() => {
                isLongPress = true;
                if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
                callback(e);
            }, 600); // 600ms long press
        }, { passive: true }); // passive true to allow scrolling if not long press? tricky. 
        // Actually if we want to prevent context menu or selection, might need passive: false.
        // But let's keep it simple.

        element.addEventListener('touchend', () => {
            clearTimeout(timer);
        });

        element.addEventListener('touchmove', () => {
            clearTimeout(timer); // Cancel if moving (scrolling)
        });

        // Mouse/Click Events (Desktop)
        element.addEventListener('click', (e) => {
            if (isTouch) return; // Ignore simulated clicks from touch
            callback(e);
        });
    }

    // Actions
    function syncDebtToMainType() {
        if (debtType === 'lend') {
            const btn = document.querySelector('.type-btn[data-type="expense"]');
            if (btn) btn.click();
        } else {
            const btn = document.querySelector('.type-btn[data-type="income"]');
            if (btn) btn.click();
        }
    }

    function updateDisplay() {
        // Calculate debt stats
        const debtStats = { USD: { owedByMe: 0, owedToMe: 0 }, EUR: { owedByMe: 0, owedToMe: 0 }, RUB: { owedByMe: 0, owedToMe: 0 }, KRW: { owedByMe: 0, owedToMe: 0 } };

        Object.keys(debts).forEach(name => {
            Object.keys(debts[name]).forEach(curr => {
                const val = debts[name][curr];
                if (Math.abs(val) > 0.01) {
                    if (val > 0) debtStats[curr].owedToMe += val;
                    else debtStats[curr].owedByMe += Math.abs(val);
                }
            });
        });

        // Main Balance
        const mainSymbol = CURRENCIES[defaultCurrency].symbol;
        const mainValue = balances[defaultCurrency];

        let mainSubtitle = '';
        const mainDebt = debtStats[defaultCurrency];
        if (mainDebt.owedByMe > 0.01) {
            mainSubtitle += `(из них я должен ${mainSymbol}${mainDebt.owedByMe.toLocaleString()}) `;
        }
        if (mainDebt.owedToMe > 0.01) {
            mainSubtitle += `(так же, мне должны ${mainSymbol}${mainDebt.owedToMe.toLocaleString()})`;
        }

        balanceEl.innerHTML = `${mainSymbol}${mainValue.toLocaleString()}<br><span id="main-subtitle" class="balance-subtitle">${mainSubtitle}</span>`;

        // Attach interaction to main subtitle
        const subtitleEl = document.getElementById('main-subtitle');
        if (subtitleEl && (mainDebt.owedByMe > 0.01 || mainDebt.owedToMe > 0.01)) {
            // Make it look interactive? It has class balance-subtitle.
            attachInteraction(subtitleEl, () => {
                showDebtDetailList(defaultCurrency);
            });
        }

        // Secondary Balances
        secondaryBalancesEl.innerHTML = '';
        Object.keys(balances).forEach(curr => {
            if (curr !== defaultCurrency && balances[curr] !== 0) {
                const item = document.createElement('div');
                item.className = 'secondary-balance-item';

                let sub = '';
                const d = debtStats[curr];
                if (d.owedByMe > 0.01) {
                    sub += ` (я должен ${CURRENCIES[curr].symbol}${d.owedByMe.toLocaleString()}) `;
                }
                if (d.owedToMe > 0.01) {
                    sub += ` (мне: ${CURRENCIES[curr].symbol}${d.owedToMe.toLocaleString()})`;
                }

                item.textContent = `${CURRENCIES[curr].symbol}${balances[curr].toLocaleString()} ${sub}`;
                secondaryBalancesEl.appendChild(item);

                // Attach interaction to secondary if it has debts?
                // The implementation plan mainly focused on "из них я должен" (the main one).
                // But user said "in THIS currency". So let's add it to secondary too if possible.
                // It's a bit harder since it's a single div. But click on the whole item can work.
                if (d.owedByMe > 0.01 || d.owedToMe > 0.01) {
                    attachInteraction(item, () => {
                        showDebtDetailList(curr);
                    });
                    item.style.cursor = 'pointer'; // Visual hint
                }
            }
        });

        // Debts Display
        debtsContainerEl.innerHTML = '';
        Object.keys(debts).forEach(name => {
            const personDebts = debts[name];
            Object.keys(personDebts).forEach(curr => {
                const amount = personDebts[curr];
                if (Math.abs(amount) > 0.01) {
                    const card = document.createElement('div');
                    card.className = 'debt-card';

                    const symbol = CURRENCIES[curr].symbol;
                    const displayAmount = Math.abs(amount).toLocaleString();

                    let text = '';
                    let amountClass = '';

                    if (amount > 0) {
                        text = `${name} должен мне`;
                        amountClass = 'positive';
                    } else {
                        text = `Я должен ${name}`;
                        amountClass = 'negative';
                    }

                    card.innerHTML = `
                        <span class="debt-info">${text}</span>
                        <span class="debt-amount ${amountClass}">${symbol}${displayAmount}</span>
                    `;
                    debtsContainerEl.appendChild(card);

                    // Attach History Interaction
                    attachInteraction(card, () => {
                        showHistory(name);
                    });
                }
            });
        });
    }

    function getAllowedRepaymentCounterparties() {
        return counterparties.filter(name => {
            const personDebts = debts[name];
            if (!personDebts) return false;
            return Object.values(personDebts).some(val => Math.abs(val) > 0.01);
        });
    }

    function updateCounterpartyOptionList() {
        counterpartyDatalist.innerHTML = '';

        let listToUse = counterparties;

        if (isRepaymentMode) {
            listToUse = getAllowedRepaymentCounterparties();
        }

        listToUse.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            counterpartyDatalist.appendChild(option);
        });
    }

    function updateCounterpartyLists() {
        updateCounterpartyOptionList();

        counterpartyMenuList.innerHTML = '';
        if (counterparties.length === 0) {
            counterpartyMenuList.innerHTML = '<li><small style="color:var(--text-secondary)">Нет контрагентов</small></li>';
        } else {
            counterparties.forEach(name => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${name}</span> <i class="fa-solid fa-clock-rotate-left" style="opacity:0.5; font-size:0.8rem"></i>`;
                li.style.cursor = 'pointer';
                counterpartyMenuList.appendChild(li);

                // Attach History Interaction in Menu
                attachInteraction(li, () => {
                    closeMenu();
                    showHistory(name);
                });
            });
        }
    }

    // --- Details Views ---

    function showHistory(name) {
        // Filter transactions for this person
        const history = transactions.filter(t => t.counterparty === name).sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';
        if (history.length === 0) {
            html = '<li class="details-item" style="justify-content:center; color:var(--text-secondary)">История пуста</li>';
        } else {
            history.forEach(t => {
                const dateObj = new Date(t.date);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const symbol = CURRENCIES[t.currency].symbol;

                let typeClass = '';
                let typeText = '';

                if (t.isDebt) {
                    // Debt Context
                    if (t.debtType === 'lend') {
                        typeClass = 'expense'; // I gave money
                        typeText = 'Я дал(а) в долг';
                    } else {
                        typeClass = 'income'; // I took money
                        typeText = 'Я взял(а) в долг';
                    }
                } else {
                    // Should not really happen if filtering by counterparty usually means debt context, 
                    // but if we support non-debt transactions with names in future, handle it.
                    // Current app only has names for debts.
                    typeText = 'Операция';
                }

                html += `
                <li class="details-item">
                    <div class="details-info">
                        <span class="details-desc">${typeText}</span>
                        <span class="details-date">${dateStr}</span>
                    </div>
                    <span class="details-amount ${typeClass}">${symbol}${t.amount.toLocaleString()}</span>
                </li>`;
            });
        }

        openDetailsModal(`История: ${name}`, html);
    }

    function showDebtDetailList(currency) {
        const symbol = CURRENCIES[currency].symbol;
        const people = []; // { name, amount }

        Object.keys(debts).forEach(name => {
            if (debts[name][currency] && Math.abs(debts[name][currency]) > 0.01) {
                people.push({ name: name, amount: debts[name][currency] });
            }
        });

        let html = '';
        if (people.length === 0) {
            html = '<li class="details-item" style="justify-content:center; color:var(--text-secondary)">Нет долгов в этой валюте</li>';
        } else {
            people.forEach(p => {
                let text = '';
                let amountClass = '';
                if (p.amount > 0) {
                    text = `${p.name} должен мне`;
                    amountClass = 'income'; // Green
                } else {
                    text = `Я должен ${p.name}`;
                    amountClass = 'expense'; // Red
                }

                html += `
                <li class="details-item">
                    <span class="details-desc">${text}</span>
                    <span class="details-amount ${amountClass}">${symbol}${Math.abs(p.amount).toLocaleString()}</span>
                </li>`;
            });
        }

        openDetailsModal(`Долги (${currency})`, html);
    }

    function openDetailsModal(title, contentHtml) {
        detailsTitle.textContent = title;
        detailsList.innerHTML = contentHtml;
        detailsModal.classList.add('active');
    }

    function closeDetailsModal() {
        detailsModal.classList.remove('active');
    }

    function openModal() {
        modal.classList.add('active');
        amountInput.value = '';
        currencySelector.value = defaultCurrency;

        debtCheckbox.checked = false;
        if (repaymentCheckbox) repaymentCheckbox.checked = false;
        isDebtMode = false;
        isRepaymentMode = false;
        debtDetails.classList.add('hidden');
        mainTypeSelector.style.display = 'flex';
        counterpartyInput.value = '';
        updateCounterpartyOptionList();

        document.querySelector('.type-btn[data-type="income"]').click();
        setTimeout(() => amountInput.focus(), 100);
    }

    function closeModal() {
        modal.classList.remove('active');
    }

    function saveTransaction() {
        const val = parseFloat(amountInput.value);
        const selectedCurrency = currencySelector.value;

        if (isNaN(val) || val <= 0) {
            alert('Пожалуйста, введите корректную сумму');
            return;
        }

        const newTx = {
            id: Date.now(),
            date: new Date().toISOString(),
            amount: val,
            currency: selectedCurrency,
            type: currentType,
            isDebt: isDebtMode,
            counterparty: isDebtMode ? counterpartyInput.value.trim() : null,
            debtType: isDebtMode ? debtType : null
        };

        if (!isDebtMode) {
            if (currentType === 'income') {
                balances[selectedCurrency] += val;
            } else {
                balances[selectedCurrency] -= val;
            }
        } else {
            const name = newTx.counterparty;
            if (!name) {
                alert('Введите имя контрагента');
                return;
            }

            if (isRepaymentMode && !counterparties.includes(name)) {
                alert('Выберите контрагента из списка. Создание новых запрещено в режиме возврата.');
                return;
            }

            if (!counterparties.includes(name)) {
                counterparties.push(name);
                updateCounterpartyLists();
            }

            if (!debts[name]) debts[name] = {};
            if (!debts[name][selectedCurrency]) debts[name][selectedCurrency] = 0;

            if (debtType === 'lend') {
                balances[selectedCurrency] -= val;
                debts[name][selectedCurrency] += val;
            } else {
                balances[selectedCurrency] += val;
                debts[name][selectedCurrency] -= val;
            }
        }

        transactions.push(newTx);
        saveData();
        updateDisplay();
        closeModal();
    }

    function loadData() {
        const storedBalances = localStorage.getItem('budget_balances_v2');
        if (storedBalances) balances = JSON.parse(storedBalances);

        const storedDefault = localStorage.getItem('budget_default_currency');
        if (storedDefault) defaultCurrency = storedDefault;

        const storedDebts = localStorage.getItem('budget_debts');
        if (storedDebts) debts = JSON.parse(storedDebts);

        const storedCounterparties = localStorage.getItem('budget_counterparties');
        if (storedCounterparties) counterparties = JSON.parse(storedCounterparties);

        const storedTransactions = localStorage.getItem('budget_transactions');
        if (storedTransactions) transactions = JSON.parse(storedTransactions);
    }

    function saveData() {
        localStorage.setItem('budget_balances_v2', JSON.stringify(balances));
        localStorage.setItem('budget_default_currency', defaultCurrency);
        localStorage.setItem('budget_debts', JSON.stringify(debts));
        localStorage.setItem('budget_counterparties', JSON.stringify(counterparties));
        localStorage.setItem('budget_transactions', JSON.stringify(transactions));
    }

    function openMenu() {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    }

    function closeMenu() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
});
