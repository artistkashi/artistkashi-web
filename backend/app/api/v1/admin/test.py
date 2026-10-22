import re

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import BernoulliNB, MultinomialNB

# Dataset path
data_path = "/opt/keras_shared/datasets/20_newsgroups"

categories = ["rec.sport.baseball", "sci.space", "talk.politics.misc", "comp.graphics"]


# Load documents
documents = []
labels = []

for label, category in enumerate(categories):
    filename = data_path + "/" + category + ".txt"
    with open(filename, "r", encoding="latin1") as f:
        text = f.read()
    docs = re.split(r"\n(?=Newsgroup:)", text)
    for doc in docs:
        doc = doc.strip()
        if not doc:
            continue
        parts = doc.split("\n\n", 1)
        if len(parts) == 2:
            document_text = parts[1]
        else:
            document_text = doc
        documents.append(document_text)
        labels.append(label)

print("Total documents:", len(documents))

# Train-test split
X_train_text, X_test_text, y_train, y_test = train_test_split(
    documents, labels, test_size=0.2, random_state=42, stratify=labels
)

# ============================================================
# MULTINOMIAL NAIVE BAYES
# ============================================================

vectorizer = CountVectorizer(max_features=10000, stop_words="english")
X_train = vectorizer.fit_transform(X_train_text)
X_test = vectorizer.transform(X_test_text)

mnb = MultinomialNB()
mnb.fit(X_train, y_train)
y_pred_mnb = mnb.predict(X_test)
mnb_accuracy = accuracy_score(y_test, y_pred_mnb)
mnb_f1 = f1_score(y_test, y_pred_mnb, average="macro")

print("\n================================")
print("       MULTINOMIAL NAIVE BAYES")
print("================================")

print("Accuracy:", round(mnb_accuracy, 4))
print("Macro F1:", round(mnb_f1, 4))
print("\nClassification Report:")
print(classification_report(y_test, y_pred_mnb, target_names=categories))

# ============================================================
# BERNOULLI NAIVE BAYES
# ============================================================

binary_vectorizer = CountVectorizer(
    max_features=10000, stop_words="english", binary=True
)
X_train_binary = binary_vectorizer.fit_transform(X_train_text)
X_test_binary = binary_vectorizer.transform(X_test_text)

bnb = BernoulliNB()
bnb.fit(X_train_binary, y_train)
y_pred_bnb = bnb.predict(X_test_binary)
bnb_accuracy = accuracy_score(y_test, y_pred_bnb)
bnb_f1 = f1_score(y_test, y_pred_bnb, average="macro")

print("\n================================")
print("        BERNOULLI NAIVE BAYES")
print("================================")

print("Accuracy:", round(bnb_accuracy, 4))
print("Macro F1:", round(bnb_f1, 4))
print("\nClassification Report:")
print(classification_report(y_test, y_pred_bnb, target_names=categories))

# ============================================================
# FINAL COMPARISON
# ============================================================

print("\n================================")
print("          FINAL COMPARISON")
print("================================")

print(f"{'Model':<25}{'Accuracy':>12}{'Macro F1':>12}")
print("-" * 49)
print(f"{'Multinomial NB':<25}{mnb_accuracy:>12.4f}{mnb_f1:>12.4f}")
print(f"{'Bernoulli NB':<25}{bnb_accuracy:>12.4f}{bnb_f1:>12.4f}")
