/**
 * File: dashboard_balance_addon.js
 * Description: Live In-Hand Cash & Stock Balance Enhancement for Mousumi Computer ERP
 * Font: 'Tiro Bangla', serif
 * Language: English Only
 */

(function () {
    'use strict';

    // ইনজেক্টেড সিএসএস স্টাইল (Tiro Bangla ফন্ট এবং রেসপনসিভ গ্রিড)
    const style = document.createElement('style');
    style.innerHTML = `
        .mc-hero-tri-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-bottom: 25px;
            font-family: 'Tiro Bangla', serif !important;
        }
        .mc-hero-box {
            border-radius: 16px;
            padding: 22px 24px;
            color: #ffffff;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            font-family: 'Tiro Bangla', serif !important;
        }
        .mc-hero-box * {
            font-family: 'Tiro Bangla', serif !important;
        }
        .mc-hero-box-primary {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #2563eb 100%);
            border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .mc-hero-box-market {
            background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
            border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .mc-hero-box-valuation {
            background: linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%);
            border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .mc-hero-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .mc-hero-title {
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            opacity: 0.9;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .mc-hero-icon {
            width: 34px;
            height: 34px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
        }
        .mc-hero-amount {
            font-size: 2rem;
            font-weight: 800;
            line-height: 1.2;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .mc-hero-subtext {
            font-size: 0.78rem;
            opacity: 0.8;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);

    // ক্যালকুলেশন এবং ড্যাশবোর্ড আপডেট ফাংশন
    function recalculateAndRenderBalances() {
        if (!window.getERPStore && !window.categories) return;

        const store = typeof window.getERPStore === 'function' ? window.getERPStore() : {};
        const categories = store.categories || window.categories || [];
        const accounts = store.accounts || window.accounts || [];
        const balanceStore = store.balanceStore || window.balanceStore || {};
        const customers = store.customers || window.customers || [];
        const transactions = store.customerTransactions || window.customerTransactions || [];

        // ১. একাউন্ট ব্যালেন্স যোগফল (Bank, Agent, Personal, Recharge ইত্যাদি)
        let totalAccountBalances = 0;
        categories.forEach(cat => {
            if (cat.enabled !== false) {
                const catAccs = accounts.filter(a => a.catId === cat.id && a.enabled !== false);
                catAccs.forEach(acc => {
                    totalAccountBalances += (parseFloat(balanceStore[acc.id]) || 0);
                });
            }
        });

        // ২. ক্যাশ ইনভেন্টরি যোগফল
        let cashInventoryTotal = 0;
        if (typeof window.calculateCashGrandTotal === 'function') {
            cashInventoryTotal = window.calculateCashGrandTotal();
        } else {
            const denomList = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
            const cashQ = store.cashQuantities || window.cashQuantities || {};
            denomList.forEach(d => {
                cashInventoryTotal += ((parseInt(cashQ[d]) || 0) * d);
            });
            cashInventoryTotal += (parseFloat(store.cashOthersAmount || window.cashOthersAmount) || 0);
        }

        // ৩. কার্ড ইনভেন্টরি স্টক যোগফল
        let cardInventoryTotal = 0;
        if (typeof window.calculateGrandCardInventoryValue === 'function') {
            cardInventoryTotal = window.calculateGrandCardInventoryValue();
        }

        // 👉 মোট হাতে থাকা ক্যাশ ও ব্যালেন্স স্থিতি (In-Hand Cash & Stock Balance)
        const inHandCashAndStock = totalAccountBalances + cashInventoryTotal + cardInventoryTotal;

        // ৪. কাস্টমার মার্কেট বাকি ও দেনা হিসাব
        let totalReceivable = 0;
        let totalPayable = 0;

        customers.forEach(c => {
            let due = parseFloat(c.openingBalance) || 0;
            const custTxs = transactions.filter(t => t.customerId === c.id);
            custTxs.forEach(t => {
                due += (parseFloat(t.debit) || 0);
                due -= (parseFloat(t.credit) || 0);
            });

            if (due > 0) {
                totalReceivable += due;
            } else if (due < 0) {
                totalPayable += Math.abs(due);
            }
        });

        // 👉 মার্কেট নিট পাওনা (Net Market Receivable)
        const netMarketReceivable = totalReceivable - totalPayable;

        // 👉 মোট সার্বিক নিট মূল্যায়ন (Total Net Business Valuation)
        const totalNetValuation = inHandCashAndStock + netMarketReceivable;

        // ফর্ম্যাটিং হেল্পার
        const fmt = (num) => '৳ ' + (num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // HTML ইনজেকশন
        const oldHero = document.querySelector('.fintech-hero-card');
        const parent = oldHero ? oldHero.parentElement : document.getElementById('dashboard-view');
        if (!parent) return;

        let triGrid = document.getElementById('mcDynamicHeroTriGrid');
        if (!triGrid) {
            triGrid = document.createElement('div');
            triGrid.id = 'mcDynamicHeroTriGrid';
            triGrid.className = 'mc-hero-tri-grid';
            if (oldHero) {
                oldHero.style.display = 'none'; // পুরোনো সিঙ্গেল কার্ডটি হাইড রাখা হলো
                oldHero.insertAdjacentElement('afterend', triGrid);
            } else {
                parent.insertBefore(triGrid, parent.firstChild);
            }
        }

        triGrid.innerHTML = `
            <!-- BOX 1: IN-HAND CASH & STOCK BALANCE -->
            <div class="mc-hero-box mc-hero-box-primary">
                <div class="mc-hero-header">
                    <span class="mc-hero-title"><i class="fa-solid fa-vault"></i> In-Hand Cash & Stock Balance</span>
                    <div class="mc-hero-icon"><i class="fa-solid fa-money-bill-wave"></i></div>
                </div>
                <div class="mc-hero-amount">${fmt(inHandCashAndStock)}</div>
                <div class="mc-hero-subtext">Cash Drawer + Bank + SIMs + Card Inventory</div>
            </div>

            <!-- BOX 2: NET MARKET RECEIVABLE -->
            <div class="mc-hero-box mc-hero-box-market">
                <div class="mc-hero-header">
                    <span class="mc-hero-title"><i class="fa-solid fa-users-viewfinder"></i> Net Market Receivable</span>
                    <div class="mc-hero-icon"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                </div>
                <div class="mc-hero-amount">${fmt(netMarketReceivable)}</div>
                <div class="mc-hero-subtext">Due (${fmt(totalReceivable)}) - Advance (${fmt(totalPayable)})</div>
            </div>

            <!-- BOX 3: TOTAL NET BUSINESS VALUATION -->
            <div class="mc-hero-box mc-hero-box-valuation">
                <div class="mc-hero-header">
                    <span class="mc-hero-title"><i class="fa-solid fa-chart-pie"></i> Total Net Valuation</span>
                    <div class="mc-hero-icon"><i class="fa-solid fa-scale-balanced"></i></div>
                </div>
                <div class="mc-hero-amount">${fmt(totalNetValuation)}</div>
                <div class="mc-hero-subtext">In-Hand Balance + Net Market Receivable</div>
            </div>
        `;
    }

    // অটো সিঙ্ক এবং লাইভ লুপ চেকার
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(recalculateAndRenderBalances, 1000);
        setInterval(recalculateAndRenderBalances, 2500);
    });

    // ফায়ারবেস লোড হয়ে গেলে সরাসরি চালানো
    setTimeout(recalculateAndRenderBalances, 1500);
})();
