import { ProxyMessageKind } from '@dfinity/agent';
import { Canister, query, update, Result, text, nat64, float64, ic, StableBTreeMap, Vec, Record, int8 } from 'azle';
import { v4 as uuidv4 } from 'uuid';

// Enums for transaction status and service type
enum TransactionStatus {
  Pending = 0,
  Ongoing = 1,
  Ready = 2,
  Completed = 3,
  Cancelled = 4,
}

enum TransactionServiceType {
  FullService = 0,
  WashOnly = 1,
  IronedOnly = 2,
}

const Transaction = Record({
  id: text,
  date: nat64,
  status: int8,
  customerID: text,
  price: float64,
  transactionType: bool, // false: regular, true: express
  serviceType: int8,
  weight: float64, // Updated type to float64
});

const Laundry = Record({
  name: text,
  location: text,
  balance: float64,
});

const Customer = Record({
  id: text,
  name: text,
  contact: text,
  balance: float64,
});

const laundryStorage: typeof Laundry = {
  name: 'Laundry ICP',
  location: 'Jakarta, Indonesia',
  balance: 0,
};

const customerStorage = StableBTreeMap(text, Customer, 0);
const transactionStorage = StableBTreeMap(text, Transaction, 1);

export default Canister({
  // Laundry
  carryOnTheTransaction: update([text], Result(text, text), (id) => {
    const transaction = transactionStorage.values().find((t: typeof Transaction) => t.id === id);
    if (!transaction) {
      return Result.Err('Transaction not found');
    }
    if (transaction.status !== TransactionStatus.Pending) {
      return Result.Err(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
    }
    transaction.status = TransactionStatus.Ongoing; // change status to ongoing
    transactionStorage.insert(transaction.id, transaction);
    return Result.Ok(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
  }),

  finishWorkingTheTransaction: update([text], Result(text, text), (id) => {
    const transaction = transactionStorage.values().find((t: typeof Transaction) => t.id === id);
    if (!transaction) {
      return Result.Err('Transaction not found');
    }
    if (transaction.status !== TransactionStatus.Ongoing) {
      return Result.Err(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
    }
    transaction.status = TransactionStatus.Ready; // change status to ready
    transactionStorage.insert(transaction.id, transaction);
    return Result.Ok(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
  }),

  getLaundryBalance: query([], Result(float64, text), () => {
    try {
      return Result.Ok(laundryStorage.balance);
    } catch (error) {
      return Result.Err('Failed to get balance');
    }
  }),

  // Transaction
  // Function to get all transactions
  getAllTransaction: query([], Result(Vec(Transaction), text), () => {
    try {
      return Result.Ok(transactionStorage.values());
    } catch (error) {
      return Result.Err('Failed to get transactions');
    }
  }),

  // Function to get transaction by ID
  getTransactionByID: query([text], Result(Transaction, text), (id) => {
    const transactions = transactionStorage.values();
    const queryTransaction = transactions.find(
      (transaction: typeof Transaction) =>
        transaction.id === id
    );
    if (!queryTransaction) {
      return Result.Err('Transaction not found!');
    }
    return Result.Ok(queryTransaction);
  }),

  // Function to create transaction
  createTransaction: update([text, float64, bool, int8], Result(text, text), (name, weight, transactionType, serviceType) => {
    // search customer with the given name
    const customer = customerStorage.values().find((c: typeof Customer) => c.name === name);
    if (!customer) {
      return Result.Err('Customer not found');
    }
    // count price
    let price: float64 = 0;
    if (!serviceType) {
      price += 8000;
    } else {
      price += 6000;
    }
    price *= weight;
    if (transactionType) {
      price *= 1.5;
    }
    const id = uuidv4();
    if (customer.balance < price) {
      return Result.Err('Balance is not enough!');
    }
    customer.balance -= price;
    const newTransaction: typeof Transaction = {
      id: id,
      date: ic.time(),
      status: TransactionStatus.Pending,
      customerID: customer.id,
      price: price,
      transactionType: transactionType,
      serviceType: serviceType,
      weight: weight,
    };
    customerStorage.insert(customer.id, customer);
    transactionStorage.insert(id, newTransaction);
    return Result.Ok(`Transaction added successfully!`);
  }),

  updateTransaction: update([text, float64, bool, int8, text], Result(text, text), (name, weight, transactionType, serviceType, id) => {
    const queryCustomer = customerStorage.values().find((c: typeof Customer) => c.name === name);
    if (!queryCustomer) {
      return Result.Err('Customer not found!');
    }
    const transaction = transactionStorage.values().find((t: typeof Transaction) => t.id === id);
    if (!transaction) {
      return Result.Err('Transaction not found!');
    }
    if (transaction.customerID !== queryCustomer.id) {
      return Result.Err('This transaction is not yours!');
    }
    if (transaction.status !== TransactionStatus.Pending) {
      return Result.Err('This transaction cannot be updated!');
    }
    // count price
    let price: float64 = 0;
    if (!serviceType) {
      price += 8000;
    } else {
      price += 6000;
    }
    price *= weight;
    if (transactionType) {
      price *= 1.5;
    }
    // add previous price to customer balance
    queryCustomer.balance += transaction.price;
    // check new price and customer balance
    if (queryCustomer.balance < price) {
      return Result.Err('Balance is not enough!');
    }
    // update transaction info
    transaction.weight = weight;
    transaction.price = price;

    // update customer info
    queryCustomer.balance -= price;

    customerStorage.insert(queryCustomer.id, queryCustomer);
    transactionStorage.insert(id, transaction);
    return Result.Ok('Transaction added successfully!');
  }),

  // Update
  finishTransaction: update([text], Result(text, text), (id) => {
    const transaction = transactionStorage.values().find((c: typeof Transaction) => c.id === id);
    if (!transaction) {
      return Result.Err('Transaction not found!');
    }
    if (transaction.status !== TransactionStatus.Ready) {
      return Result.Err(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
    }
    transaction.status = TransactionStatus.Completed;
    laundryStorage.balance += transaction.price;
    transactionStorage.insert(transaction.id, transaction);
    return Result.Ok(`Transaction ${transaction.id} finished successfully!`);
  }),

  cancelTransaction: update([text], Result(text, text), (id) => {
    const transaction = transactionStorage.values().find((c: typeof Transaction) => c.id === id);
    if (!transaction) {
      return Result.Err('Transaction not found!');
    }
    if (transaction.status !== TransactionStatus.Pending) {
      return Result.Err(`Transaction ${transaction.id} is ${TransactionStatus[transaction.status]}.`);
    }
    transaction.status = TransactionStatus.Cancelled;
    transactionStorage.insert(transaction.id, transaction);

    const customer = customerStorage.values().find((c: typeof Customer) => c.id === transaction.customerID);
    customer.balance += transaction.price;
    customerStorage.insert(customer.id, customer);
    return Result.Ok(`Transaction ${transaction.id} cancelled!`);
  }),

  // Customer
  createCustomer: update([text, text], Result(text, text), (name, contact) => {
    const customer = customerStorage.values().find((c: typeof Customer) => c.name === name);
    if (customer) {
      return Result.Err('Customer already exists.');
    }
    const id = uuidv4();
    const newCustomer: typeof Customer = {
      id,
      name,
      contact,
      balance: 0,
    };
    customerStorage.insert(id, newCustomer);
    return Result.Ok(`Customer ${newCustomer.name} added successfully.`);
  }),

  getCustomerBalance: query([text], Result(float64, text), (name) => {
    try {
      const customer = customerStorage.values().find((c: typeof Customer) => c.name === name);
      if (!customer) {
        return Result.Err(`Customer with name ${name} does not exist!`);
      }
      return Result.Ok(customer.balance);
    } catch (error) {
      return Result.Err('Failed to get customer balance');
    }
  }),

  updateBalance: update([text, float64], Result(text, text), (name, balance) => {
    const customer = customerStorage.values().find((c: typeof Customer) => c.name === name);
    if (!customer) {
      return Result.Err('Customer not found');
    }
    customer.balance += balance;
    customerStorage.insert(customer.id, customer);
    return Result.Ok('Balance has been successfully updated');
  }),
});
