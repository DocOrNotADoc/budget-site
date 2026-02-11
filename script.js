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
    let debts = {}; // { "Name": { "USD": 100, "EUR": -50 } } -> Positive: They owe me. Negative: I owe them.
    let counterparties = []; // List of names
    let defaultCurrency = 'USD';
    let currentType = 'income'; // 'income' or 'expense'
    let isDebtMode = false;
    let isRepaymentMode = false;
    let debtType = 'lend'; // 'lend' (I give) or 'borrow' (I take)

    // Init State from LocalStorage
    loadData();

    // DOM Elements - Main
    const balanceEl = document.getElementById('balance-amount');
    const secondaryBalancesEl = document.getElementById('secondary-balances');
    const debtsContainerEl = document.getElementById('debts-container');
    const fabBtn = document.getElementById('add-btn');

    // DOM Elements - Modal
    const modal = document.getElementById('transaction-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const saveBtn = document.getElementById('save-transaction');
    const amountInput = document.getElementById('amount-input');
    const currencySelector = document.getElementById('currency-selector');
    const mainTypeSelector = document.querySelector('.transaction-type-selector:not(.small)');
    const typeBtns = document.querySelectorAll('.transaction-type-selector:not(.small) .type-btn');

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
            mainTypeSelector.style.display = 'none'; // Hide main toggle
            syncDebtToMainType();
        } else {
            debtDetails.classList.add('hidden');
            mainTypeSelector.style.display = 'flex'; // Show main toggle
            isRepaymentMode = false; // Reset repayment mode
            repaymentCheckbox.checked = false;
            updateCounterpartyOptionList(); // Reset list to full
        }
    });

    // Repayment Checkbox Toggle
    if (repaymentCheckbox) {
        repaymentCheckbox.addEventListener('change', (e) => {
            isRepaymentMode = e.target.checked;
            updateCounterpartyOptionList();
        });
    }

    // Debt Type Toggle (Lend/Borrow)
    debtTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            debtTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            debtType = btn.dataset.debtType;

            // Sync with main type
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

    // When currency in modal changes, update list if in repayment mode?
    // Not strictly necessary unless we filter by currency, but user said "existing counterparties".
    // Usually existing implies ANY debt. We'll stick to ANY debt for simplicity unless requested.

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
        // Calculate debt stats per currency
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

        // Build subtitle for main balance
        let mainSubtitle = '';
        const mainDebt = debtStats[defaultCurrency];
        if (mainDebt.owedByMe > 0.01) {
            mainSubtitle += `(из них я должен ${mainSymbol}${mainDebt.owedByMe.toLocaleString()}) `;
        }
        if (mainDebt.owedToMe > 0.01) {
            mainSubtitle += `(так же, мне должны ${mainSymbol}${mainDebt.owedToMe.toLocaleString()})`;
        }

        balanceEl.innerHTML = `${mainSymbol}${mainValue.toLocaleString()}<br><span class="balance-subtitle">${mainSubtitle}</span>`;

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
                }
            });
        });
    }

    function updateCounterpartyOptionList() {
        counterpartyDatalist.innerHTML = '';

        let listToUse = counterparties;

        if (isRepaymentMode) {
            // Filter: only people with non-zero debts
            listToUse = counterparties.filter(name => {
                const personDebts = debts[name];
                if (!personDebts) return false;
                // Check if any currency has non-zero debt
                return Object.values(personDebts).some(val => Math.abs(val) > 0.01);
            });
        }

        listToUse.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            counterpartyDatalist.appendChild(option);
        });
    }

    function updateCounterpartyLists() {
        updateCounterpartyOptionList();

        // Menu list
        counterpartyMenuList.innerHTML = '';
        if (counterparties.length === 0) {
            counterpartyMenuList.innerHTML = '<li><small style="color:var(--text-secondary)">Нет контрагентов</small></li>';
        } else {
            counterparties.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                counterpartyMenuList.appendChild(li);
            });
        }
    }

    function openModal() {
        modal.classList.add('active');
        amountInput.value = '';
        currencySelector.value = defaultCurrency;

        // Reset debt state
        debtCheckbox.checked = false;
        if (repaymentCheckbox) repaymentCheckbox.checked = false;

        isDebtMode = false;
        isRepaymentMode = false;

        debtDetails.classList.add('hidden');
        mainTypeSelector.style.display = 'flex'; // Ensure visible on open
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

        // Logic
        if (!isDebtMode) {
            // Normal Transaction
            if (currentType === 'income') {
                balances[selectedCurrency] += val;
            } else {
                balances[selectedCurrency] -= val;
            }
        } else {
            // Debt Transaction
            const name = counterpartyInput.value.trim();
            if (!name) {
                alert('Введите имя контрагента');
                return;
            }

            // Update Counterparties list if new
            if (!counterparties.includes(name)) {
                counterparties.push(name);
                updateCounterpartyLists();
            }

            // Initialize debt record for person if not exists
            if (!debts[name]) debts[name] = {};
            if (!debts[name][selectedCurrency]) debts[name][selectedCurrency] = 0;

            if (debtType === 'lend') {
                // I lend money -> My cash decreases, Their debt to me increases
                balances[selectedCurrency] -= val;
                debts[name][selectedCurrency] += val;
            } else {
                // I borrow money -> My cash increases, My debt to them increases (Their debt decreases)
                balances[selectedCurrency] += val;
                debts[name][selectedCurrency] -= val;
            }
        }

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
    }

    function saveData() {
        localStorage.setItem('budget_balances_v2', JSON.stringify(balances));
        localStorage.setItem('budget_default_currency', defaultCurrency);
        localStorage.setItem('budget_debts', JSON.stringify(debts));
        localStorage.setItem('budget_counterparties', JSON.stringify(counterparties));
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
