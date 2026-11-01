import BudgetManager from '../components/Budget/BudgetManager';

const BudgetPage = () => {
    return (
        <div>
            <div className="page-header">
                <h1>Budget Manager</h1>
                <p>Set monthly budgets and track your spending goals</p>
            </div>
            <BudgetManager />
        </div>
    );
};

export default BudgetPage;
